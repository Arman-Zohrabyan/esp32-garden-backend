import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceLog } from './device-log.entity';
import { DeviceLogsService } from './device-logs.service';
import { DeviceLogsController } from './device-logs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceLog])],
  providers: [DeviceLogsService],
  controllers: [DeviceLogsController],
})
export class DeviceLogsModule {}
