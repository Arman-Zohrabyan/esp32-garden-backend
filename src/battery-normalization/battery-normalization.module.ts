import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatteryNormalization } from './battery-normalization.entity';
import { BatteryNormalizationService } from './battery-normalization.service';
import { BatteryNormalizationController } from './battery-normalization.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BatteryNormalization])],
  providers: [BatteryNormalizationService],
  controllers: [BatteryNormalizationController],
})
export class BatteryNormalizationModule {}
