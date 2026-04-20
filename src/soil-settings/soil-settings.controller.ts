import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { SoilSettingsService } from './soil-settings.service';
import { SoilSettings } from './soil-settings.entity';

// Dashboard-facing only — the device reads/confirms soil settings via
// POST /devices/by-chip/:chipId/sync instead.
@Controller('devices/:deviceId/soil-settings')
export class SoilSettingsController {
  constructor(private readonly service: SoilSettingsService) {}

  @Get()
  findByDevice(@Param('deviceId') deviceId: string): Promise<SoilSettings> {
    return this.service.findByDevice(deviceId);
  }

  // human updates settings → revision bumps
  @Put()
  upsert(
    @Param('deviceId') deviceId: string,
    @Body() body: Partial<SoilSettings>,
  ): Promise<SoilSettings> {
    return this.service.upsert(deviceId, body);
  }
}
