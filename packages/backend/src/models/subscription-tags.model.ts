import { RecordId } from '@bt/shared/types';
import Tags from '@models/tags.model';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';

import Subscriptions from './subscriptions.model';

@Table({ tableName: 'SubscriptionTags', timestamps: false, freezeTableName: true })
export default class SubscriptionTags extends Model {
  @ForeignKey(() => Subscriptions)
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID })
  subscriptionId!: RecordId;

  @ForeignKey(() => Tags)
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID })
  tagId!: RecordId;
}
