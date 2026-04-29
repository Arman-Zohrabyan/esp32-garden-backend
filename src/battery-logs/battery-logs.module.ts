import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatteryLog } from './battery-log.entity';
import { BatteryLogsService } from './battery-logs.service';
import { BatteryLogsController } from './battery-logs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BatteryLog])],
  providers: [BatteryLogsService],
  controllers: [BatteryLogsController],
})
export class BatteryLogsModule {}
