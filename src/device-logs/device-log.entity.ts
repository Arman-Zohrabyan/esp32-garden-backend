import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Device } from '../devices/device.entity';

@Entity('device_logs')
@Index(['deviceId', 'bootCount'])
export class DeviceLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device!: Device;

  @Column()
  @Index()
  deviceId!: string;

  // Monotonic wake counter from the device's RTC memory. Nullable: a log
  // may come from something other than a device wake cycle, and rows
  // written before this field existed have none. Lets e.g. a BROWNOUT boot
  // log (sent on the following successful wake) be tied back to the wake
  // that actually failed, not the one that reported it.
  @Column({ type: 'int', nullable: true })
  bootCount: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'jsonb' })
  info: object;
}
