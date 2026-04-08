import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { Device } from './device.entity';
import { SoilSettings } from '../soil-settings/soil-settings.entity';
import { SoilReading } from '../soil-readings/soil-reading.entity';
import { DeviceLog } from '../device-logs/device-log.entity';
import { BatteryType } from '../battery/battery.entity';
import { PumpSettings } from '../pump-settings/pump-settings.entity';
import { WateringAfterEntry, WateringEntry } from './devices.service';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  findAll(): Promise<Device[]> {
    return this.devicesService.findAll();
  }

  @Get(':chipId')
  findByChipId(@Param('chipId') chipId: string): Promise<Device> {
    return this.devicesService.findByChipId(chipId);
  }

  @Post()
  create(@Body() body: Partial<Device>): Promise<Device> {
    return this.devicesService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<Device>): Promise<Device> {
    return this.devicesService.update(id, body);
  }

  // One heartbeat/config call: registers the device on first contact (by
  // chipId, no separate register step), applies the revision confirms if
  // provided (device, soil, pump), submits any battery voltage/percentage
  // logs, and always replies with the full device + soil + pump settings
  // objects plus each battery's sampling config. Replaces register + ping +
  // soil-settings GET + the confirms + battery logging + battery config GET.
  @Post('by-chip/:chipId/sync')
  sync(
    @Param('chipId') chipId: string,
    @Body('device') deviceBody: Partial<Device> = {},
    @Body('soil') soilBody: Partial<SoilSettings> = {},
    @Body('batteryLogs')
    batteryLogs: { type: BatteryType; volt: number; percentage: number }[] = [],
    @Body('pump') pumpBody: Partial<PumpSettings> = {},
  ) {
    return this.devicesService.sync(chipId, deviceBody, soilBody, batteryLogs, pumpBody);
  }

  // One-call replacement for POST soil-readings + POST device-logs, plus
  // the auto-watering records (firmware 0.4.0+). Every array is optional;
  // an empty/omitted array is a no-op for that part of the payload, not an
  // error.
  @Post('by-chip/:chipId/report')
  report(
    @Param('chipId') chipId: string,
    @Body('readings') readings: Partial<SoilReading>[] = [],
    @Body('logs') logs: Partial<DeviceLog>[] = [],
    @Body('waterings') waterings: WateringEntry[] = [],
    @Body('wateringsAfter') wateringsAfter: WateringAfterEntry[] = [],
  ) {
    return this.devicesService.report(chipId, readings, logs, waterings, wateringsAfter);
  }

  // Asked by the board right before it runs the pump; see
  // DevicesService.requestWatering. Writes nothing.
  @Post('by-chip/:chipId/watering')
  watering(
    @Param('chipId') chipId: string,
    @Body() body: { moisture?: number; pumpBatteryVolt?: number },
  ) {
    return this.devicesService.requestWatering(chipId, body);
  }
}
