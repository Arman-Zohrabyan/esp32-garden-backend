import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SoilReading } from './soil-reading.entity';

export interface SoilReadingsPage {
  items: SoilReading[];
  total: number;
  limit: number;
  offset: number;
  // True when older readings exist beyond this page. The dashboard groups
  // readings into watering cycles, and the oldest cycle in a page is only
  // partial while this is true (its earlier readings are in the next page),
  // so it must not be charted as if it were complete.
  hasMore: boolean;
}

const DEFAULT_LIMIT = 100;
// Higher than the battery cap: a soil cycle spans a whole watering-to-dry
// stretch, so the dashboard asks for several thousand readings at a time to
// get enough complete cycles per page.
const MAX_LIMIT = 5000;

@Injectable()
export class SoilReadingsService {
  constructor(
    @InjectRepository(SoilReading) private repo: Repository<SoilReading>,
  ) {}

  // Newest-first and paginated. `limit: 0` is an explicit "no pagination"
  // escape hatch for callers that genuinely want the whole history.
  async findByDevice(
    deviceId: string,
    limit?: number,
    offset?: number,
  ): Promise<SoilReadingsPage> {
    const take =
      limit === 0
        ? undefined
        : Math.min(MAX_LIMIT, Math.max(1, limit ?? DEFAULT_LIMIT));
    const skip = Math.max(0, offset ?? 0);

    const [items, total] = await this.repo.findAndCount({
      where: { deviceId },
      // id breaks ties: several readings can share a recordedAt (a cycle
      // resending RTC-buffered readings stamps them alike), and ordering by
      // the timestamp alone leaves their relative order undefined, so
      // OFFSET/LIMIT could drop or repeat one across a page boundary.
      order: { recordedAt: 'DESC', id: 'DESC' },
      ...(take !== undefined && { take }),
      skip,
    });

    return {
      items,
      total,
      limit: take ?? total,
      offset: skip,
      hasMore: skip + items.length < total,
    };
  }
}
