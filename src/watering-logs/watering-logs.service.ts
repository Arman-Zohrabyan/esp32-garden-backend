import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WateringLog } from './watering-log.entity';

export interface WateringLogsPage {
  items: WateringLog[];
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

    return {
      items,
      total,
      limit: take,
      offset: skip,
      hasMore: skip + items.length < total,
    };
  }
}
