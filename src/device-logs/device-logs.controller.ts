import { Controller, Get, Query } from '@nestjs/common';
import { DeviceLogsService } from './device-logs.service';

// Dashboard-facing only — the device submits logs via
// POST /devices/by-chip/:chipId/report instead.
@Controller('device-logs')
export class DeviceLogsController {
  constructor(private readonly service: DeviceLogsService) {}

  @Get()
  findAll(
    @Query('deviceId') deviceId?: string,
    @Query('level') level?: string,
    @Query('event') event?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('keyLike') keyLike?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      deviceId,
      level,
      event,
      from,
      to,
      keyLike,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
