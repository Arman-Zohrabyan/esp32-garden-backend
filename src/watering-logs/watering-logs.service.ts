import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WateringLog } from './watering-log.entity';
import { Device } from '../devices/device.entity';
import { Battery, BatteryType } from '../battery/battery.entity';
import { calibrateVolt } from '../battery/battery-calibration';

// pumpBatteryVolt is corrected by the pump battery's voltCalib, the same way
// battery logs are; rawPumpBatteryVolt is what the board sent and the table
// stores.
export type CalibratedWateringLog = WateringLog & { rawPumpBatteryVolt: number | null };

export interface WateringLogsPage {
  items: CalibratedWateringLog[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

@Injectable()
export class WateringLogsService {
  constructor(
    @InjectRepository(WateringLog) private repo: Repository<WateringLog>,
    @InjectRepository(Device) private devicesRepo: Repository<Device>,
    @InjectRepository(Battery) private batteryRepo: Repository<Battery>,
  ) {}

  // Newest-first and paginated, same shape as soil readings.
  async findByDevice(
    deviceId: string,
    limit?: number,
    offset?: number,
  ): Promise<WateringLogsPage> {
    const take = Math.min(MAX_LIMIT, Math.max(1, limit ?? DEFAULT_LIMIT));
    const skip = Math.max(0, offset ?? 0);

    const [items, total] = await this.repo.findAndCount({
      where: { deviceId },
      order: { wateredAt: 'DESC', id: 'DESC' },
      take,
      skip,
    });

    // Battery rows hang off chipId, watering rows off the device uuid.
    const device = items.length
      ? await this.devicesRepo.findOne({ where: { id: deviceId } })
      : null;
    const pumpBattery = device
      ? await this.batteryRepo.findOne({
          where: { deviceChipId: device.chipId, type: BatteryType.PUMP },
        })
      : null;
    const calib = pumpBattery?.voltCalib ?? 1;

    return {
      items: items.map((w) => ({
        ...w,
        rawPumpBatteryVolt: w.pumpBatteryVolt,
        pumpBatteryVolt: w.pumpBatteryVolt === null ? null : calibrateVolt(w.pumpBatteryVolt, calib),
      })),
      total,
      limit: take,
      offset: skip,
      hasMore: skip + items.length < total,
    };
  }
}
