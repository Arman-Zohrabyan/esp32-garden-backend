import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Device } from '../devices/device.entity';

// Auto-watering config, one row per device. Same revision/appliedRevision
// handshake as SoilSettings: a dashboard PUT bumps revision, the board
// confirms it in the next sync. The moisture trigger itself lives in
// SoilSettings.autoWaterPercent — this row is "how much and how often".
@Entity('pump_settings')
export class PumpSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device!: Device;

  @Column({ unique: true })
  deviceId!: string;

  // Master switch. Off: the board keeps measuring, never runs the pump.
  @Column({ default: true })
  autoWaterEnabled!: boolean;

  // Water per watering, ml. The board turns it into pump run time with
  // flowMlPerSec.
  @Column({ default: 350 })
  waterMl!: number;

  // Pump output at 5 V (MT3608), ml per second. Measured on the real pump:
  // exactly 1000 ml in 37.5 s.
  @Column({ type: 'real', default: 26.67 })
  flowMlPerSec!: number;

  // Deep sleep right after a watering. The wake that follows measures how
  // far the moisture rose (WateringLog.moistureAfter), then the board goes
  // back to its normal Device.sleepSeconds rhythm.
  @Column({ default: 600 })
  postWaterSleepSeconds!: number;

  // At most this many waterings in any rolling 24 h. Checked by the server
  // on POST .../watering, and by the board itself when it has no server.
  @Column({ default: 3 })
  maxWateringsPerDay!: number;

  // Pump cell below this voltage: no watering, the board logs
  // watering_skipped with reason pump_battery_low instead.
  @Column({ type: 'real', default: 3.3 })
  minBatteryVolt!: number;

  // Hard cap on one pump run, whatever waterMl / flowMlPerSec work out to —
  // a typo like waterMl 3500 must not empty the jar onto the floor.
  @Column({ default: 60 })
  maxPumpSeconds!: number;

  @Column({ default: 1 })
  revision!: number;

  @Column({ type: 'int', nullable: true, default: null })
  appliedRevision!: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
