import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Battery } from './battery.entity';
import { BatteryService } from './battery.service';
import { BatteryController } from './battery.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Battery])],
  providers: [BatteryService],
  controllers: [BatteryController],
})
export class BatteryModule {}
