import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SoilReading } from './soil-reading.entity';
import { SoilReadingsService } from './soil-readings.service';
import { SoilReadingsController } from './soil-readings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SoilReading])],
  providers: [SoilReadingsService],
  controllers: [SoilReadingsController],
})
export class SoilReadingsModule {}
