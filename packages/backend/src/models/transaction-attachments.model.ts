import { ATTACHMENT_MIME_TYPES, type AttachmentMimeType, type RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Transactions from './transactions.model';
import Users from './users.model';

@Table({
  tableName: 'TransactionAttachments',
  timestamps: true,
  updatedAt: false,
  freezeTableName: true,
  indexes: [{ fields: ['transactionId'] }, { fields: ['userId'] }],
})
export default class TransactionAttachments extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Transactions)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare transactionId: RecordId;

  /** Uploader; the row's `size` counts against this user's storage quota. */
  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare userId: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare filename: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    validate: { isIn: [[...ATTACHMENT_MIME_TYPES]] },
  })
  declare mimeType: AttachmentMimeType;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare size: number;

  @BelongsTo(() => Transactions)
  declare transaction: Transactions;

  @BelongsTo(() => Users)
  declare user: Users;
}
