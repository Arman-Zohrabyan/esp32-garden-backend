import { Controller, Get, Param, Query } from '@nestjs/common';
import { WateringLogsService, WateringLogsPage } from './watering-logs.service';

// Dashboard-facing only — the device submits waterings via
// POST /devices/by-chip/:chipId/report instead.
@Controller('devices/:deviceId/waterings')
export class WateringLogsController {
  constructor(private readonly service: WateringLogsService) {}

  @Get()
  findByDevice(
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<WateringLogsPage> {
    return this.service.findByDevice(
      deviceId,
      limit !== undefined ? parseInt(limit, 10) : undefined,
      offset !== undefined ? parseInt(offset, 10) : undefined,
    );
  }
}
