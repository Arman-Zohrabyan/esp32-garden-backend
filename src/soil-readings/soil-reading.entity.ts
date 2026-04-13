import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Device } from '../devices/device.entity';

@Entity('soil_readings')
@Index(['deviceId', 'recordedAt'])
@Index(['deviceId', 'bootCount'])
export class SoilReading {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column()
  deviceId: string;

  @Column()
  raw: number;

  @Column({ type: 'smallint', nullable: true })
  percent: number | null;

  @Column({ type: 'real' })
  voltage: number;

  @Column()
  minRaw: number;

  @Column()
  maxRaw: number;

  @Column({ type: 'smallint', nullable: true })
  rssi: number | null;

  @Column()
  uptimeSec: number;

  // Monotonic wake counter from the device's RTC memory, survives deep
  // sleep. Nullable for backward compatibility with rows written before
  // this field existed. Lets a resent/deferred reading (sent a cycle late
  // after a failed upload) be correlated back to the wake it was taken on,
  // rather than the wake it was uploaded on.
  @Column({ type: 'int', nullable: true })
  bootCount: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  recordedAt: Date;
}
