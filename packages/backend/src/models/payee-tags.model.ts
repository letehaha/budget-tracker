import { RecordId } from '@bt/shared/types';
import Tags from '@models/tags.model';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';

import Payees from './payees.model';

@Table({ tableName: 'PayeeTags', timestamps: false, freezeTableName: true })
export default class PayeeTags extends Model {
  @ForeignKey(() => Payees)
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID })
  payeeId!: RecordId;

  @ForeignKey(() => Tags)
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID })
  tagId!: RecordId;
}
