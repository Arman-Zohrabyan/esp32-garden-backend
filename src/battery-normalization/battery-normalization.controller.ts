import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { BatteryNormalizationService } from './battery-normalization.service';
import { BatteryNormalization } from './battery-normalization.entity';

@Controller('battery-normalization')
export class BatteryNormalizationController {
  constructor(private readonly service: BatteryNormalizationService) {}

  @Get()
  findAll(
    @Query('batteryId', new ParseIntPipe({ optional: true })) batteryId?: number,
  ): Promise<BatteryNormalization[]> {
    return this.service.findAll(batteryId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<BatteryNormalization> {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: Partial<BatteryNormalization>): Promise<BatteryNormalization> {
    return this.service.create(body);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<BatteryNormalization>,
  ): Promise<BatteryNormalization> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.service.remove(id);
  }
}
