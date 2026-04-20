import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SoilSettings } from './soil-settings.entity';

@Injectable()
export class SoilSettingsService {
  constructor(
    @InjectRepository(SoilSettings) private repo: Repository<SoilSettings>,
  ) {}

  async findByDevice(deviceId: string): Promise<SoilSettings> {
    const settings = await this.repo.findOne({ where: { deviceId } });
    if (!settings) throw new NotFoundException(`No settings for device ${deviceId}`);
    return settings;
  }

  async upsert(deviceId: string, dto: Partial<SoilSettings>): Promise<SoilSettings> {
    let settings = await this.repo.findOne({ where: { deviceId } });
    if (settings) {
      Object.assign(settings, dto, { revision: settings.revision + 1 });
    } else {
      settings = this.repo.create({ ...dto, deviceId, revision: 1 });
    }
    return this.repo.save(settings);
  }
}
