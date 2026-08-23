import { RecordId } from '@bt/shared/types';
import Tags from '@models/tags.model';
import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import TransactionTemplates from './transaction-templates.model';

@Table({ tableName: 'TransactionTemplateTags', timestamps: false, freezeTableName: true })
export default class TransactionTemplateTags extends Model {
  @ForeignKey(() => TransactionTemplates)
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID })
  templateId!: RecordId;

  @ForeignKey(() => Tags)
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID })
  tagId!: RecordId;
}
