import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Battery } from './battery.entity';

@Injectable()
export class BatteryService {
  constructor(
    @InjectRepository(Battery) private repo: Repository<Battery>,
  ) {}

  findAll(deviceChipId?: string): Promise<Battery[]> {
    return this.repo.find({
      where: deviceChipId ? { deviceChipId } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Battery> {
    const battery = await this.repo.findOne({ where: { id } });
    if (!battery) throw new NotFoundException(`Battery ${id} not found`);
    return battery;
  }

  create(dto: Partial<Battery>): Promise<Battery> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: number, dto: Partial<Battery>): Promise<Battery> {
    const battery = await this.repo.findOne({ where: { id } });
    if (!battery) throw new NotFoundException(`Battery ${id} not found`);
    Object.assign(battery, dto);
    return this.repo.save(battery);
  }

  async remove(id: number): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) throw new NotFoundException(`Battery ${id} not found`);
  }
}
