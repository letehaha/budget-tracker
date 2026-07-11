import { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';

import Payees from './payees.model';

@Table({
  tableName: 'PayeeAliases',
  timestamps: true,
  updatedAt: false,
  freezeTableName: true,
})
export default class PayeeAliases extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Payees)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  payeeId!: RecordId;

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  rawName!: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  normalizedName!: string;

  declare createdAt: Date;

  @BelongsTo(() => Payees)
  payee!: Payees;
}
