import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'BillingWebhookEvents',
  timestamps: false,
  freezeTableName: true,
})
export default class BillingWebhookEvents extends Model {
  @Column({ type: DataType.STRING, primaryKey: true, allowNull: false })
  eventId!: string;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  receivedAt!: Date;
}
