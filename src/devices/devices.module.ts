import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './device.entity';
import { SoilSettings } from '../soil-settings/soil-settings.entity';
import { SoilReading } from '../soil-readings/soil-reading.entity';
import { DeviceLog } from '../device-logs/device-log.entity';
import { Battery } from '../battery/battery.entity';
import { BatteryLog } from '../battery-logs/battery-log.entity';
import { PumpSettings } from '../pump-settings/pump-settings.entity';
import { WateringLog } from '../watering-logs/watering-log.entity';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Device,
      SoilSettings,
      SoilReading,
      DeviceLog,
      Battery,
      BatteryLog,
      PumpSettings,
      WateringLog,
    ]),
  ],
  providers: [DevicesService],
  controllers: [DevicesController],
})
export class DevicesModule {}
