import { Controller, Get, Post, Body, Query, ParseIntPipe } from '@nestjs/common';
import { BatteryLogsService, BatteryLogsPage } from './battery-logs.service';
import { BatteryLog } from './battery-log.entity';

@Controller('battery-logs')
export class BatteryLogsController {
  constructor(private readonly service: BatteryLogsService) {}

  // Paginated, newest-first. `limit=0` returns the full history.
  @Get()
  findAll(
    @Query('batteryId', new ParseIntPipe({ optional: true })) batteryId?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ): Promise<BatteryLogsPage> {
    return this.service.findAll(batteryId, limit, offset);
  }

  @Post()
  create(
    @Body() body: { batteryId: number; volt: number; percentage: number },
  ): Promise<BatteryLog> {
    return this.service.create(body.batteryId, body.volt, body.percentage);
  }
}
