import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Battery } from './battery.entity';
import { BatteryLog } from '../battery-logs/battery-log.entity';
import { CALIB_MAX, CALIB_MIN } from './battery-calibration';

@Injectable()
export class BatteryService {
  constructor(
    @InjectRepository(Battery) private repo: Repository<Battery>,
    @InjectRepository(BatteryLog) private logsRepo: Repository<BatteryLog>,
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

  // Besides the plain fields, accepts `calibrateToVolt`: the voltage a
  // multimeter shows on the cell right now. The factor is worked out against
  // the board's latest raw reading of this battery (an idle cell barely moves
  // between the reading and the measurement), so nobody has to divide by hand.
  async update(
    id: number,
    dto: Partial<Battery> & { calibrateToVolt?: unknown },
  ): Promise<Battery> {
    const battery = await this.repo.findOne({ where: { id } });
    if (!battery) throw new NotFoundException(`Battery ${id} not found`);

    const { calibrateToVolt, ...fields } = dto;

    if (calibrateToVolt !== undefined) {
      if (typeof calibrateToVolt !== 'number' || calibrateToVolt < 2.5 || calibrateToVolt > 4.5)
        throw new BadRequestException('calibrateToVolt must be a voltage from 2.5 to 4.5');
      const latest = await this.logsRepo.findOne({
        where: { batteryId: id },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      if (!latest) throw new BadRequestException('No readings from the board yet to calibrate against');
      fields.voltCalib = Math.round((calibrateToVolt / latest.volt) * 10000) / 10000;
    }

    if (fields.voltCalib !== undefined) {
      const c = fields.voltCalib;
      if (typeof c !== 'number' || !Number.isFinite(c) || c < CALIB_MIN || c > CALIB_MAX)
        throw new BadRequestException(
          `voltCalib must be from ${CALIB_MIN} to ${CALIB_MAX} — a bigger error is a wiring fault, not calibration`,
        );
    }

    Object.assign(battery, fields);
    return this.repo.save(battery);
  }

  async remove(id: number): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) throw new NotFoundException(`Battery ${id} not found`);
  }
}
