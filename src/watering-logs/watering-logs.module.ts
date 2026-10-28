import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WateringLog } from './watering-log.entity';
import { Device } from '../devices/device.entity';
import { Battery } from '../battery/battery.entity';
import { WateringLogsService } from './watering-logs.service';
import { WateringLogsController } from './watering-logs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WateringLog, Device, Battery])],
  providers: [WateringLogsService],
  controllers: [WateringLogsController],
})
export class WateringLogsModule {}
