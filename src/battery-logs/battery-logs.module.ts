import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatteryLog } from './battery-log.entity';
import { Battery } from '../battery/battery.entity';
import { BatteryLogsService } from './battery-logs.service';
import { BatteryLogsController } from './battery-logs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BatteryLog, Battery])],
  providers: [BatteryLogsService],
  controllers: [BatteryLogsController],
})
export class BatteryLogsModule {}
