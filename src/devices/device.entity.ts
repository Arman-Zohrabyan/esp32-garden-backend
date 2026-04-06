import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  chipId: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date;

  @Column({ type: 'inet', nullable: true })
  lastIp: string;

  @Column({ nullable: true })
  firmwareVersion: string;

  @Column({ default: 50 }) // works only if connection is established and active.
  sleepSeconds: number;

  // false: only the device itself (local side) can set this to true.
  // true: only the backend can set this back to false.
  @Column({ default: false })
  isActive!: boolean;

  // Set when isActive transitions true→false via PUT /devices/:id; cleared
  // (null) on the false→true transition. Exists so the dashboard can tell
  // "just deactivated, still finishing its last sleepSeconds cycle" apart
  // from "been inactive for a while, heartbeating on deviceLogsSeconds" —
  // updatedAt doesn't work for this since a plain sync also bumps it.
  @Column({ type: 'timestamptz', nullable: true })
  deactivatedAt: Date | null;

  // Interval for device_logs heartbeat while isActive is false. Unused while isActive is true.
  @Column({ default: 300 })
  deviceLogsSeconds!: number;

  @Column({ default: 1 })
  revision: number;

  @Column({ nullable: true })
  appliedRevision: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
