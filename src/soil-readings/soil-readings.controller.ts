import { Controller, Get, Param, Query } from '@nestjs/common';
import { SoilReadingsService, SoilReadingsPage } from './soil-readings.service';

// Dashboard-facing only — the device submits readings via
// POST /devices/by-chip/:chipId/report instead.
@Controller('devices/:deviceId/soil-readings')
export class SoilReadingsController {
  constructor(private readonly service: SoilReadingsService) {}

  // Paginated, newest-first. `limit=0` returns the full history.
  @Get()
  findByDevice(
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<SoilReadingsPage> {
    return this.service.findByDevice(
      deviceId,
      limit !== undefined ? parseInt(limit, 10) : undefined,
      offset !== undefined ? parseInt(offset, 10) : undefined,
    );
  }
}
