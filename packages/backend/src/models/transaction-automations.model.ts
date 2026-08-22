import type { AutomationAction, AutomationConditions, AutomationPausedReason, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import Users from '@models/users.model';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'TransactionAutomations',
  timestamps: true,
  freezeTableName: true,
})
export default class TransactionAutomations extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING(120),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  isEnabled!: boolean;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  position!: number;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  conditions!: AutomationConditions;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  actions!: AutomationAction[];

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  matchCount!: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  lastMatchedAt!: Date | null;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  pausedReason!: AutomationPausedReason | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Users)
  user!: Users;
}
