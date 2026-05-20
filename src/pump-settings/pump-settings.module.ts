import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PumpSettings } from './pump-settings.entity';
import { PumpSettingsService } from './pump-settings.service';
import { PumpSettingsController } from './pump-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PumpSettings])],
  providers: [PumpSettingsService],
  controllers: [PumpSettingsController],
})
export class PumpSettingsModule {}
