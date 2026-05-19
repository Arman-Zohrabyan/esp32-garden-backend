import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { PumpSettingsService } from './pump-settings.service';
import { PumpSettings } from './pump-settings.entity';

// Dashboard-facing only — the device reads/confirms pump settings via
// POST /devices/by-chip/:chipId/sync instead.
@Controller('devices/:deviceId/pump-settings')
export class PumpSettingsController {
  constructor(private readonly service: PumpSettingsService) {}

  @Get()
  findByDevice(@Param('deviceId') deviceId: string): Promise<PumpSettings> {
    return this.service.findByDevice(deviceId);
  }

  // human updates settings → revision bumps
  @Put()
  upsert(
    @Param('deviceId') deviceId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<PumpSettings> {
    return this.service.upsert(deviceId, body);
  }
}
