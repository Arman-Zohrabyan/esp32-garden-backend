import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Battery } from '../battery/battery.entity';

@Entity('battery_logs')
export class BatteryLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Battery, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batteryId' })
  battery: Battery;

  @Column()
  @Index()
  batteryId: number;

  @Column({ type: 'real' })
  volt: number;

  @Column({ type: 'smallint' })
  percentage: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
