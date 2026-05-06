import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceLog } from './device-log.entity';

export interface DeviceLogsFilter {
  deviceId?: string;
  level?: string;
  event?: string;
  from?: string;
  to?: string;
  keyLike?: string;
  page?: number;
  limit?: number;
}

export interface DeviceLogsPage {
  items: DeviceLog[];
  total: number;
  page: number;
  limit: number;
}

const MAX_LIMIT = 100;

@Injectable()
export class DeviceLogsService {
  constructor(@InjectRepository(DeviceLog) private repo: Repository<DeviceLog>) {}

  async findAll(filter: DeviceLogsFilter): Promise<DeviceLogsPage> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filter.limit ?? MAX_LIMIT));

    const qb = this.repo.createQueryBuilder('log').orderBy('log.createdAt', 'DESC');

    if (filter.deviceId) {
      qb.andWhere('log.deviceId = :deviceId', { deviceId: filter.deviceId });
    }
    // level/event live inside the freeform `info` jsonb column, not their
    // own columns — ->> pulls them out as text for the comparison.
    if (filter.level) {
      qb.andWhere(`log.info ->> 'level' = :level`, { level: filter.level });
    }
    if (filter.event) {
      qb.andWhere(`log.info ->> 'event' = :event`, { event: filter.event });
    }
    if (filter.from) {
      qb.andWhere('log.createdAt >= :from', { from: filter.from });
    }
    if (filter.to) {
      qb.andWhere('log.createdAt <= :to', { to: filter.to });
    }
    // Matches any entry with at least one info key containing the given
    // substring (case-insensitive) — e.g. keyLike=nvs catches nvsWrites,
    // nvsWearPct, and any future nvs* field, on any event type, without
    // needing to know the exact key names or enumerate event types.
    if (filter.keyLike) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM jsonb_object_keys(log.info) k WHERE k ILIKE :keyLike)`,
        { keyLike: `%${filter.keyLike}%` },
      );
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit };
  }
}
