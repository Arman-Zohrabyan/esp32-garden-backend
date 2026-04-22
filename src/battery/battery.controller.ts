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
import { BatteryService } from './battery.service';
import { Battery } from './battery.entity';

@Controller('battery')
export class BatteryController {
  constructor(private readonly service: BatteryService) {}

  @Get()
  findAll(@Query('deviceChipId') deviceChipId?: string): Promise<Battery[]> {
    return this.service.findAll(deviceChipId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Battery> {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: Partial<Battery>): Promise<Battery> {
    return this.service.create(body);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<Battery>,
  ): Promise<Battery> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.service.remove(id);
  }
}
