import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatteryNormalization } from './battery-normalization.entity';

@Injectable()
export class BatteryNormalizationService {
  constructor(
    @InjectRepository(BatteryNormalization)
    private repo: Repository<BatteryNormalization>,
  ) {}

  findAll(batteryId?: number): Promise<BatteryNormalization[]> {
    return this.repo.find({
      where: batteryId ? { batteryId } : {},
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<BatteryNormalization> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Battery normalization ${id} not found`);
    return row;
  }

  create(dto: Partial<BatteryNormalization>): Promise<BatteryNormalization> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(
    id: number,
    dto: Partial<BatteryNormalization>,
  ): Promise<BatteryNormalization> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Battery normalization ${id} not found`);
    Object.assign(row, dto);
    return this.repo.save(row);
  }

  async remove(id: number): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) throw new NotFoundException(`Battery normalization ${id} not found`);
  }
}
