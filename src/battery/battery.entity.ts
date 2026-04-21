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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
