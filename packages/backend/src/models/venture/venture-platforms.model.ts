import { RecordId } from '@bt/shared/types';
import { BelongsTo, Column, DataType, ForeignKey, Index, Model, Table } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Users from '../users.model';

@Table({
  timestamps: true,
  paranoid: true,
  tableName: 'VenturePlatforms',
})
export default class VenturePlatforms extends Model {
  @Column({
    primaryKey: true,
    unique: true,
    allowNull: false,
    type: DataType.UUID,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(2000), allowNull: true })
  website!: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  description!: string | null;

  @Column({ type: DataType.DECIMAL(10, 6), allowNull: false, defaultValue: '0' })
  defaultEntryFeePct!: string;

  @Column({ type: DataType.DECIMAL(10, 6), allowNull: false, defaultValue: '0' })
  defaultMgmtFeePct!: string;

  @Column({ type: DataType.DECIMAL(10, 6), allowNull: false, defaultValue: '0' })
  defaultCarryPct!: string;

  @Column({ type: DataType.DECIMAL(10, 6), allowNull: false, defaultValue: '0' })
  defaultHurdlePct!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare updatedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare deletedAt: Date | null;

  @BelongsTo(() => Users)
  user?: Users;
}
