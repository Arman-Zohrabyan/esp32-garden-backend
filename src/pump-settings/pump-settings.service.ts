import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PumpSettings } from './pump-settings.entity';

// Editable fields and their allowed ranges. Anything else in a PUT body
// (id, deviceId, revision...) is ignored rather than written through — a
// pump setting out of range is a watering accident, not a display glitch,
// so these are checked here and not only on the board.
const LIMITS: Record<string, [number, number]> = {
  waterMl: [10, 2000],
  flowMlPerSec: [1, 200],
  postWaterSleepSeconds: [60, 86400],
  maxWateringsPerDay: [1, 8],
  minBatteryVolt: [3.0, 4.2],
  maxPumpSeconds: [1, 300],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Devices created before pump settings existed have no row yet; it is
// created with the defaults on first use instead of 404ing. Shared with
// DevicesService (sync, watering), hence a plain function over the repo.
// orIgnore: the dashboard and a syncing board may race to create it.
export async function ensurePumpSettings(
  repo: Repository<PumpSettings>,
  deviceId: string,
): Promise<PumpSettings> {
  // Postgres rejects a malformed uuid with a 500 before any lookup happens.
  if (!UUID_RE.test(deviceId)) throw new NotFoundException(`Device ${deviceId} not found`);
  const existing = await repo.findOne({ where: { deviceId } });
  if (existing) return existing;
  try {
    await repo
      .createQueryBuilder()
      .insert()
      .into(PumpSettings)
      .values({ deviceId })
      .orIgnore()
      .execute();
  } catch {
    // Foreign key (or uuid syntax) violation: there is no such device.
    throw new NotFoundException(`Device ${deviceId} not found`);
  }
  return repo.findOneOrFail({ where: { deviceId } });
}

@Injectable()
export class PumpSettingsService {
  constructor(
    @InjectRepository(PumpSettings) private repo: Repository<PumpSettings>,
  ) {}

  findByDevice(deviceId: string): Promise<PumpSettings> {
    return ensurePumpSettings(this.repo, deviceId);
  }

  // human updates settings → revision bumps
  async upsert(deviceId: string, body: Record<string, unknown>): Promise<PumpSettings> {
    const dto: Partial<PumpSettings> = {};

    if ('autoWaterEnabled' in body) {
      if (typeof body.autoWaterEnabled !== 'boolean')
        throw new BadRequestException('autoWaterEnabled must be true or false');
      dto.autoWaterEnabled = body.autoWaterEnabled;
    }

    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      if (!(key in body)) continue;
      const value = body[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
        throw new BadRequestException(`${key} must be a number from ${min} to ${max}`);
      // Whole-number columns get whole numbers; flow and volts keep decimals.
      const isReal = key === 'flowMlPerSec' || key === 'minBatteryVolt';
      (dto as Record<string, number>)[key] = isReal ? value : Math.round(value);
    }

    const settings = await this.findByDevice(deviceId);
    Object.assign(settings, dto, { revision: settings.revision + 1 });
    return this.repo.save(settings);
  }
}
