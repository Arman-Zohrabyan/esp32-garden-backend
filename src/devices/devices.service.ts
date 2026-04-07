import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Device } from './device.entity';
import { SoilSettings } from '../soil-settings/soil-settings.entity';
import { SoilReading } from '../soil-readings/soil-reading.entity';
import { DeviceLog } from '../device-logs/device-log.entity';
import { Battery, BatteryType } from '../battery/battery.entity';
import { BatteryLog } from '../battery-logs/battery-log.entity';
import { PumpSettings } from '../pump-settings/pump-settings.entity';
import { ensurePumpSettings } from '../pump-settings/pump-settings.service';
import { WateringLog } from '../watering-logs/watering-log.entity';

const REVISION_FIELDS: (keyof Device)[] = ['sleepSeconds', 'isActive'];

export interface ReportError {
  index: number;
  reason: string;
}

export interface ReportResult {
  accepted: number;
  rejected: number;
  errors?: ReportError[];
}

// One pump run as the board reports it (report.waterings[]).
export interface WateringEntry {
  nonce?: number;
  bootCount?: number;
  ml?: number;
  seconds?: number;
  flowMlPerSec?: number;
  moistureBefore?: number;
  moistureAfter?: number;
  pumpBatteryVolt?: number;
  offline?: boolean;
  // Seconds between the pump run and this report (board's own clock, which
  // keeps counting through deep sleep). 0 / missing = it just happened.
  agoSec?: number;
}

// Moisture measured on the wake after the post-watering sleep
// (report.wateringsAfter[]), matched to its watering by nonce.
export interface WateringAfterEntry {
  nonce?: number;
  moistureAfter?: number;
}

// Reply to POST /devices/by-chip/:chipId/watering.
export interface WateringDecision {
  allowed: boolean;
  // null when allowed; otherwise disabled | daily_limit | pump_battery_low | not_dry
  reason: string | null;
  ml: number;
  flowMlPerSec: number;
  seconds: number;
  maxPumpSeconds: number;
  wateringsToday: number;
  maxWateringsPerDay: number;
}

const DAY_MS = 24 * 3600 * 1000;
// An offline watering older than this is stamped "now" instead: the board's
// clock is only meaningful since its last power-on, and the RTC queue it
// came from does not survive one anyway.
const MAX_WATERING_AGO_SEC = 30 * 24 * 3600;

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device) private repo: Repository<Device>,
    @InjectRepository(SoilSettings)
    private soilSettingsRepo: Repository<SoilSettings>,
    @InjectRepository(SoilReading)
    private soilReadingsRepo: Repository<SoilReading>,
    @InjectRepository(DeviceLog)
    private deviceLogsRepo: Repository<DeviceLog>,
    @InjectRepository(Battery)
    private batteryRepo: Repository<Battery>,
    @InjectRepository(BatteryLog)
    private batteryLogsRepo: Repository<BatteryLog>,
    @InjectRepository(PumpSettings)
    private pumpSettingsRepo: Repository<PumpSettings>,
    @InjectRepository(WateringLog)
    private wateringLogsRepo: Repository<WateringLog>,
  ) {}

  findAll(): Promise<Device[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findByChipId(chipId: string): Promise<Device> {
    const device = await this.repo.findOne({ where: { chipId } });
    if (!device) throw new NotFoundException(`Device ${chipId} not found`);
    return device;
  }

  async create(dto: Partial<Device>): Promise<Device> {
    const device = await this.repo.save(this.repo.create(dto));
    await this.provisionDefaults(device.id, device.chipId);
    return device;
  }

  async update(id: string, dto: Partial<Device>): Promise<Device> {
    const device = await this.repo.findOne({ where: { id } });
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    const bumpsRevision = REVISION_FIELDS.some((f) => f in dto);
    // Track the true→false transition specifically (not just "isActive is
    // false in the body") so the dashboard can distinguish "just
    // deactivated, still finishing its last sleepSeconds cycle" from
    // "been inactive for a while" — see the deactivatedAt column comment.
    const justDeactivated = dto.isActive === false && device.isActive === true;
    const justActivated = dto.isActive === true && device.isActive === false;
    Object.assign(device, dto, {
      ...(bumpsRevision && { revision: device.revision + 1 }),
      ...(justDeactivated && { deactivatedAt: new Date() }),
      ...(justActivated && { deactivatedAt: null }),
    });
    return this.repo.save(device);
  }

  // One-call replacement for register + ping + soil-settings GET + both
  // confirm PATCHes + battery-log submission. Addressed by chipId (not the
  // server-issued uuid), since chipId is the one identifier the board
  // always has, even before it has ever talked to the server.
  //
  // Unknown chipId: creates the device (and its default SoilSettings +
  // Battery rows) instead of 404ing, so a wiped DB or a brand-new board hit
  // the exact same code path — no separate "register" branch needed on the
  // firmware side. isActive on that fresh row comes from the board's own
  // reported state in `device.isActive`, since the server has no prior
  // opinion yet.
  //
  // Known chipId: the server's isActive always wins over whatever the body
  // says — otherwise a remote/dashboard deactivation could be clobbered by
  // a board that hasn't caught up yet. appliedRevision on either object,
  // if present, is applied as a confirm.
  //
  // Response always contains the full device and soil objects (no
  // revision-diffing) to keep the reply shape uniform for the firmware.
  async sync(
    chipId: string,
    deviceBody: Partial<Pick<Device, 'name' | 'firmwareVersion' | 'lastIp' | 'appliedRevision' | 'isActive'>>,
    soilBody: Partial<Pick<SoilSettings, 'appliedRevision'>>,
    batteryLogs: { type: BatteryType; volt: number; percentage: number }[],
    pumpBody: Partial<Pick<PumpSettings, 'appliedRevision'>> = {},
  ): Promise<{
    device: Device;
    soil: SoilSettings;
    pump: PumpSettings;
    batteries: { type: BatteryType; checkEveryMs: number; checkAvgCount: number }[];
    batteryLogs: ReportResult;
  }> {
    let device = await this.repo.findOne({ where: { chipId } });

    if (!device) {
      device = this.repo.create({
        chipId,
        name: deviceBody.name,
        firmwareVersion: deviceBody.firmwareVersion,
        isActive: deviceBody.isActive ?? false,
        lastSeenAt: new Date(),
        ...(deviceBody.lastIp && { lastIp: deviceBody.lastIp }),
      });
      device = await this.repo.save(device);
      await this.provisionDefaults(device.id, device.chipId);
    } else {
      Object.assign(device, {
        lastSeenAt: new Date(),
        ...(deviceBody.lastIp && { lastIp: deviceBody.lastIp }),
        ...(deviceBody.firmwareVersion && {
          firmwareVersion: deviceBody.firmwareVersion,
        }),
        ...(deviceBody.appliedRevision !== undefined && {
          appliedRevision: deviceBody.appliedRevision,
        }),
      });
      device = await this.repo.save(device);
    }

    let soil = await this.soilSettingsRepo.findOne({
      where: { deviceId: device.id },
    });
    if (!soil) {
      soil = await this.soilSettingsRepo.save(
        this.soilSettingsRepo.create({ deviceId: device.id }),
      );
    } else if (soilBody.appliedRevision !== undefined) {
      soil.appliedRevision = soilBody.appliedRevision;
      soil = await this.soilSettingsRepo.save(soil);
    }

    // Same confirm handshake as soil. Devices that predate pump settings get
    // their row here, on their first sync after the upgrade.
    let pump = await ensurePumpSettings(this.pumpSettingsRepo, device.id);
    if (pumpBody.appliedRevision !== undefined) {
      pump.appliedRevision = pumpBody.appliedRevision;
      pump = await this.pumpSettingsRepo.save(pump);
    }

    const batteryLogsResult = await this.insertBatteryLogs(chipId, batteryLogs);

    const batteries = await this.batteryRepo.find({ where: { deviceChipId: chipId } });
    const batteriesConfig = batteries.map((b) => ({
      type: b.type,
      checkEveryMs: b.checkEveryMs,
      checkAvgCount: b.checkAvgCount,
    }));

    return { device, soil, pump, batteries: batteriesConfig, batteryLogs: batteryLogsResult };
  }

  // Provisions the per-device rows that must exist from the moment a
  // device first appears, regardless of whether it arrived via sync
  // (self-registration) or POST /devices (admin/API creation): the default
  // SoilSettings and PumpSettings rows, and one Battery row per known
  // battery slot (the board's own ESP32 supply, plus the pump's separate
  // cell — measured by firmware 0.4.0+ on GPIO35).
  private async provisionDefaults(deviceId: string, chipId: string): Promise<void> {
    await this.soilSettingsRepo
      .createQueryBuilder()
      .insert()
      .into(SoilSettings)
      .values({ deviceId })
      .orIgnore()
      .execute();

    await ensurePumpSettings(this.pumpSettingsRepo, deviceId);

    const hasBatteries = await this.batteryRepo.exists({
      where: { deviceChipId: chipId },
    });
    if (!hasBatteries) {
      await this.batteryRepo
        .createQueryBuilder()
        .insert()
        .into(Battery)
        .values([
          { deviceChipId: chipId, type: BatteryType.ESP32 },
          { deviceChipId: chipId, type: BatteryType.PUMP },
        ])
        .execute();
    }
  }

  // One-call replacement for POST soil-readings + POST device-logs.
  // Accepts arrays for both (either/both may be omitted or empty — a
  // sensor-disconnected cycle sends only a log, a resent RTC-buffered
  // reading can arrive alongside a fresh one). Individual entries are
  // validated minimally (required fields present) so one bad entry in a
  // batch doesn't sink the rest; rejected entries are reported back so the
  // firmware knows not to discard its retry buffer.
  async report(
    chipId: string,
    readings: Partial<SoilReading>[],
    logs: Partial<DeviceLog>[],
    waterings: WateringEntry[] = [],
    wateringsAfter: WateringAfterEntry[] = [],
  ): Promise<{
    readings: ReportResult;
    logs: ReportResult;
    waterings: ReportResult;
    wateringsAfter: ReportResult;
    device: { isActive: boolean; revision: number };
    serverTime: number;
  }> {
    const device = await this.repo.findOne({ where: { chipId } });
    if (!device) throw new NotFoundException(`Device ${chipId} not found`);

    // A report is a device contact just like a sync — keep lastSeenAt
    // fresh even if a firmware ever reports without a preceding sync.
    await this.repo.update(device.id, { lastSeenAt: new Date() });

    const readingsResult = await this.insertReadings(device.id, readings);
    const logsResult = await this.insertLogs(device.id, logs);
    // Waterings before wateringsAfter: one report can carry both for the
    // same nonce (a watering that was queued offline and measured since).
    const wateringsResult = await this.insertWaterings(device.id, waterings);
    const wateringsAfterResult = await this.applyWateringsAfter(device.id, wateringsAfter);

    return {
      readings: readingsResult,
      logs: logsResult,
      waterings: wateringsResult,
      wateringsAfter: wateringsAfterResult,
      device: { isActive: device.isActive, revision: device.revision },
      serverTime: Math.floor(Date.now() / 1000),
    };
  }

  // The board asks this right before running the pump: "soil is at X %,
  // pump cell at Y V — may I, and how much?". The answer carries the dose
  // (ml), the flow to convert it with and the resulting run time, so the
  // dashboard's latest values apply even if they changed after this
  // cycle's sync. The server is the authority on the rolling 24 h limit,
  // since it holds every reported watering; the board keeps its own count
  // only for when it has no server.
  //
  // Nothing is written here: the watering itself arrives in the report
  // that follows, with how long the pump actually ran.
  async requestWatering(
    chipId: string,
    body: { moisture?: number; pumpBatteryVolt?: number },
  ): Promise<WateringDecision> {
    const device = await this.repo.findOne({ where: { chipId } });
    if (!device) throw new NotFoundException(`Device ${chipId} not found`);
    await this.repo.update(device.id, { lastSeenAt: new Date() });

    const pump = await ensurePumpSettings(this.pumpSettingsRepo, device.id);
    const soil = await this.soilSettingsRepo.findOne({ where: { deviceId: device.id } });

    const wateringsToday = await this.wateringLogsRepo.count({
      where: { deviceId: device.id, wateredAt: MoreThan(new Date(Date.now() - DAY_MS)) },
    });

    let reason: string | null = null;
    if (!pump.autoWaterEnabled) reason = 'disabled';
    else if (wateringsToday >= pump.maxWateringsPerDay) reason = 'daily_limit';
    else if (typeof body.pumpBatteryVolt === 'number' && body.pumpBatteryVolt < pump.minBatteryVolt)
      reason = 'pump_battery_low';
    else if (soil && typeof body.moisture === 'number' && body.moisture > soil.autoWaterPercent)
      reason = 'not_dry';

    const seconds = Math.min(pump.waterMl / pump.flowMlPerSec, pump.maxPumpSeconds);

    return {
      allowed: reason === null,
      reason,
      ml: pump.waterMl,
      flowMlPerSec: pump.flowMlPerSec,
      seconds: Math.round(seconds * 100) / 100,
      maxPumpSeconds: pump.maxPumpSeconds,
      wateringsToday,
      maxWateringsPerDay: pump.maxWateringsPerDay,
    };
  }

  // A resent watering (its first report reached the server but the reply
  // got lost) carries the same nonce: it counts as accepted, so the board
  // drops it from its queue, but is not inserted twice.
  private async insertWaterings(
    deviceId: string,
    entries: WateringEntry[],
  ): Promise<ReportResult> {
    const errors: ReportError[] = [];
    let accepted = 0;
    const now = Date.now();

    for (const [index, e] of entries.entries()) {
      if (typeof e.nonce !== 'number' || typeof e.ml !== 'number' || typeof e.seconds !== 'number') {
        errors.push({ index, reason: 'missing field(s): nonce, ml, seconds' });
        continue;
      }
      const nonce = String(e.nonce);
      const duplicate = await this.wateringLogsRepo.exists({ where: { deviceId, nonce } });
      if (!duplicate) {
        const ago = e.agoSec ?? 0;
        const agoSec = ago > 0 && ago < MAX_WATERING_AGO_SEC ? ago : 0;
        await this.wateringLogsRepo.insert({
          deviceId,
          nonce,
          bootCount: e.bootCount ?? null,
          ml: Math.round(e.ml),
          seconds: e.seconds,
          flowMlPerSec: e.flowMlPerSec ?? null,
          moistureBefore: e.moistureBefore ?? null,
          moistureAfter: e.moistureAfter ?? null,
          pumpBatteryVolt: e.pumpBatteryVolt ?? null,
          offline: e.offline === true,
          wateredAt: new Date(now - agoSec * 1000),
        });
      }
      accepted++;
    }

    return {
      accepted,
      rejected: errors.length,
      ...(errors.length && { errors }),
    };
  }

  private async applyWateringsAfter(
    deviceId: string,
    entries: WateringAfterEntry[],
  ): Promise<ReportResult> {
    const errors: ReportError[] = [];
    let accepted = 0;

    for (const [index, e] of entries.entries()) {
      if (typeof e.nonce !== 'number' || typeof e.moistureAfter !== 'number') {
        errors.push({ index, reason: 'missing field(s): nonce, moistureAfter' });
        continue;
      }
      const result = await this.wateringLogsRepo.update(
        { deviceId, nonce: String(e.nonce) },
        { moistureAfter: e.moistureAfter },
      );
      if (result.affected) accepted++;
      else errors.push({ index, reason: `unknown watering nonce: ${e.nonce}` });
    }

    return {
      accepted,
      rejected: errors.length,
      ...(errors.length && { errors }),
    };
  }

  private async insertReadings(
    deviceId: string,
    readings: Partial<SoilReading>[],
  ): Promise<ReportResult> {
    const required: (keyof SoilReading)[] = [
      'raw',
      'voltage',
      'minRaw',
      'maxRaw',
      'uptimeSec',
    ];
    const errors: ReportError[] = [];
    const valid: Partial<SoilReading>[] = [];

    readings.forEach((r, index) => {
      const missing = required.filter((f) => r[f] === undefined || r[f] === null);
      if (missing.length) {
        errors.push({ index, reason: `missing field(s): ${missing.join(', ')}` });
      } else {
        valid.push({ ...r, deviceId });
      }
    });

    if (valid.length) await this.soilReadingsRepo.insert(valid);

    return {
      accepted: valid.length,
      rejected: errors.length,
      ...(errors.length && { errors }),
    };
  }

  private async insertLogs(
    deviceId: string,
    logs: Partial<DeviceLog>[],
  ): Promise<ReportResult> {
    const errors: ReportError[] = [];
    const valid: Partial<DeviceLog>[] = [];

    logs.forEach((l, index) => {
      if (!l.info) {
        errors.push({ index, reason: 'missing field: info' });
      } else {
        valid.push({ ...l, deviceId });
      }
    });

    if (valid.length) await this.deviceLogsRepo.insert(valid);

    return {
      accepted: valid.length,
      rejected: errors.length,
      ...(errors.length && { errors }),
    };
  }

  // Resolves each entry's `type` to this device's Battery row (esp32/pump,
  // both provisioned alongside the device itself — see provisionDefaults)
  // and inserts a BatteryLog against it.
  private async insertBatteryLogs(
    chipId: string,
    entries: { type: BatteryType; volt: number; percentage: number }[],
  ): Promise<ReportResult> {
    const errors: ReportError[] = [];
    const valid: Partial<BatteryLog>[] = [];

    if (!entries.length) return { accepted: 0, rejected: 0 };

    const batteries = await this.batteryRepo.find({
      where: { deviceChipId: chipId },
    });
    const batteryIdByType = new Map(batteries.map((b) => [b.type, b.id]));

    entries.forEach((e, index) => {
      const batteryId = e.type ? batteryIdByType.get(e.type) : undefined;
      if (!batteryId) {
        errors.push({ index, reason: `unknown battery type: ${e.type}` });
      } else if (e.volt === undefined || e.percentage === undefined) {
        errors.push({ index, reason: 'missing field(s): volt, percentage' });
      } else {
        valid.push({ batteryId, volt: e.volt, percentage: e.percentage });
      }
    });

    if (valid.length) await this.batteryLogsRepo.insert(valid);

    return {
      accepted: valid.length,
      rejected: errors.length,
      ...(errors.length && { errors }),
    };
  }
}
