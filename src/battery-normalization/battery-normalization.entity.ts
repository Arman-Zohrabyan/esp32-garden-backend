import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Battery } from '../battery/battery.entity';

@Entity('battery_normalization')
export class BatteryNormalization {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Battery, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batteryId' })
  battery: Battery;

  @Column()
  @Index()
  batteryId: number;

  @Column({ type: 'real' })
  multimeterValue: number;

  @Column()
  esp32Value: number;
}
