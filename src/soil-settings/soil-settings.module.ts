import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SoilSettings } from './soil-settings.entity';
import { SoilSettingsService } from './soil-settings.service';
import { SoilSettingsController } from './soil-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SoilSettings])],
  providers: [SoilSettingsService],
  controllers: [SoilSettingsController],
})
export class SoilSettingsModule {}
