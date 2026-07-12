import { SubscriptionPeriodNotificationModel, RemindBeforePreset, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';

import SubscriptionPeriods from './subscription-periods.model';

@Table({
  tableName: 'SubscriptionPeriodNotifications',
  timestamps: false,
  freezeTableName: true,
})
export default class SubscriptionPeriodNotifications extends Model implements SubscriptionPeriodNotificationModel {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => SubscriptionPeriods)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  periodId!: RecordId;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  remindBeforePreset!: RemindBeforePreset;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  sentAt!: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  emailSent!: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  emailError!: string | null;

  @BelongsTo(() => SubscriptionPeriods, { foreignKey: 'periodId', onDelete: 'CASCADE' })
  period!: SubscriptionPeriods;
}
