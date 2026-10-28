import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BatteryLog } from './battery-log.entity';
import { Battery } from '../battery/battery.entity';
import { calibrateLog } from '../battery/battery-calibration';

// volt/percentage are corrected by the battery's voltCalib; rawVolt and
// rawPercentage are what the board sent (and what the table stores).
export type CalibratedBatteryLog = BatteryLog & { rawVolt: number; rawPercentage: number };

export interface BatteryLogsPage {
  items: CalibratedBatteryLog[];
  total: number;
  limit: number;
  offset: number;
  // True when older logs exist beyond this page. The dashboard charts logs
  // grouped into charge cycles, and the oldest cycle in a page is only
  // partial while this is true (its earlier readings are in the next page),
  // so it must not be charted as if it were a complete cycle.
  hasMore: boolean;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

@Injectable()
export class BatteryLogsService {
  constructor(
    @InjectRepository(BatteryLog) private repo: Repository<BatteryLog>,
    @InjectRepository(Battery) private batteryRepo: Repository<Battery>,
  ) {}

  // Newest-first and paginated. `limit: 0` is an explicit "no pagination"
  // escape hatch for callers that genuinely want the whole history.
  async findAll(
    batteryId?: number,
    limit?: number,
    offset?: number,
  ): Promise<BatteryLogsPage> {
    const where = batteryId ? { batteryId } : {};
    const take =
      limit === 0 ? undefined : Math.min(MAX_LIMIT, Math.max(1, limit ?? DEFAULT_LIMIT));
    const skip = Math.max(0, offset ?? 0);

    const [items, total] = await this.repo.findAndCount({
      where,
      // id breaks ties: logs submitted in the same sync share a createdAt,
      // and ordering by it alone leaves their relative order undefined, so
      // OFFSET/LIMIT could drop or repeat one across a page boundary.
      order: { createdAt: 'DESC', id: 'DESC' },
      ...(take !== undefined && { take }),
      skip,
    });

    const batteryIds = [...new Set(items.map((l) => l.batteryId))];
    const batteries = batteryIds.length
      ? await this.batteryRepo.find({ where: { id: In(batteryIds) } })
      : [];
    const calibById = new Map(batteries.map((b) => [b.id, b.voltCalib]));

    return {
      items: items.map((l) => calibrateLog(l, calibById.get(l.batteryId) ?? 1)),
      total,
      limit: take ?? total,
      offset: skip,
      hasMore: skip + items.length < total,
    };
  }

  create(batteryId: number, volt: number, percentage: number): Promise<BatteryLog> {
    return this.repo.save(this.repo.create({ batteryId, volt, percentage }));
  }
}
