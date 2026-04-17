import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Device } from '../devices/device.entity';

@Entity('soil_settings')
export class SoilSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device!: Device;

  @Column({ unique: true })
  deviceId!: string;

  @Column({ default: 3050 })
  soilDry!: number;

  @Column({ default: 900 })
  soilWet!: number;

  @Column({ default: 400 })
  soilEveryMs!: number;

  @Column({ default: 10 })
  soilAvgCount!: number;

  @Column({ default: 30 })
  dryAlertPercent!: number;

  // Moisture percentage at or below which the board runs the pump on its
  // own (firmware 0.4.0+). Separate from dryAlertPercent so the alert can
  // fire before (or after) watering kicks in. How much water and how often
  // live in PumpSettings.
  @Column({ default: 20 })
  autoWaterPercent!: number;

  @Column({ default: 1 })
  revision!: number;

  @Column({ type: 'int', nullable: true, default: null })
  appliedRevision!: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
