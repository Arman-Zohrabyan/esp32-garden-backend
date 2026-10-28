import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Device } from '../devices/device.entity';

export enum BatteryType {
  ESP32 = 'esp32',
  PUMP = 'pump',
}

@Entity('battery')
export class Battery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: BatteryType })
  type: BatteryType;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceChipId', referencedColumnName: 'chipId' })
  device: Device;

  @Column()
  deviceChipId: string;

  @Column({ default: 400 })
  checkEveryMs: number;

  @Column({ default: 10 })
  checkAvgCount: number;

  @Column({ default: 30 })
  batteryAlertPercent: number;

  // Multimeter / board voltage. Applied when logs are read (see
  // battery-calibration.ts) — battery_logs keep what the board sent, and the
  // firmware never sees this value. 1 = no correction.
  @Column({ type: 'real', default: 1 })
  voltCalib: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
