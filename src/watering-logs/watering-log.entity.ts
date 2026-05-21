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

// One row per pump run, written from the waterings[] array of
// POST /devices/by-chip/:chipId/report (firmware 0.4.0+). moistureAfter
// arrives later, in wateringsAfter[] of the report sent by the wake that
// follows the post-watering sleep.
@Entity('watering_logs')
@Index(['deviceId', 'wateredAt'])
@Index(['deviceId', 'nonce'])
export class WateringLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column()
  deviceId: string;

  // Random 32-bit id the board gives each watering. A report whose reply
  // got lost is resent next cycle; the nonce makes that resend a no-op
  // instead of a second row, and lets wateringsAfter find its watering.
  @Column({ type: 'bigint' })
  nonce: string;

  // Wake counter of the cycle that ran the pump (see SoilReading.bootCount).
  @Column({ type: 'int', nullable: true })
  bootCount: number | null;

  // Dose asked for, ml (PumpSettings.waterMl at the time).
  @Column()
  ml: number;

  // How long the pump actually ran. Shorter than ml / flowMlPerSec when the
  // maxPumpSeconds cap kicked in or the run was stopped with BOOT.
  @Column({ type: 'real' })
  seconds: number;

  @Column({ type: 'real', nullable: true })
  flowMlPerSec: number | null;

  // Soil moisture % that triggered the watering, and the one measured after
  // the post-watering sleep (null until that report arrives, or for good
  // if the sensor failed on that wake).
  @Column({ type: 'smallint', nullable: true })
  moistureBefore: number | null;

  @Column({ type: 'smallint', nullable: true })
  moistureAfter: number | null;

  // Pump cell voltage measured right before the run.
  @Column({ type: 'real', nullable: true })
  pumpBatteryVolt: number | null;

  // true = the board had no server and watered on its cached settings; the
  // row arrived with a later report.
  @Column({ default: false })
  offline: boolean;

  // When the pump ran: server receive time minus the board's agoSec, so an
  // offline watering reported hours later still lands at the right time.
  @Column({ type: 'timestamptz' })
  wateredAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
