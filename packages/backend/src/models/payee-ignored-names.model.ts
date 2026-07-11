import { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';

import Users from './users.model';

@Table({
  tableName: 'PayeeIgnoredNames',
  timestamps: true,
  updatedAt: false,
  freezeTableName: true,
})
export default class PayeeIgnoredNames extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  normalizedName!: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  rawSample!: string | null;

  declare createdAt: Date;

  @BelongsTo(() => Users)
  user!: Users;
}
