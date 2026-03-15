import { TagReminderFrequency, TagReminderSettings, TagReminderType } from '@bt/shared/types';
import Tags from '@models/Tags.model';
import Users from '@models/Users.model';
import { Table, Column, Model, ForeignKey, DataType, BelongsTo } from 'sequelize-typescript';

@Table({
  tableName: 'TagReminders',
  timestamps: true,
})
export default class TagReminders extends Model {
  @Column({ primaryKey: true, autoIncrement: true, allowNull: false, type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Users)
  @Column({ allowNull: false, type: DataType.INTEGER })
  userId!: number;

  @ForeignKey(() => Tags)
  @Column({ allowNull: false, type: DataType.INTEGER })
  tagId!: number;

  @Column({ allowNull: false, type: DataType.STRING(20) })
  type!: TagReminderType;

  /** Frequency preset. Null means real-time trigger (immediate when tagged) */
  @Column({ allowNull: true, type: DataType.STRING(15) })
  frequency!: TagReminderFrequency | null;

  /** Day of month to check (1-31). Only for monthly/quarterly/yearly. Null = 1st */
  @Column({ allowNull: true, type: DataType.SMALLINT })
  dayOfMonth!: number | null;

  /** Type-specific settings (e.g., amountThreshold for amount_threshold type) */
  @Column({ allowNull: false, type: DataType.JSONB, defaultValue: {} })
  settings!: TagReminderSettings;

  @Column({ allowNull: false, type: DataType.BOOLEAN, defaultValue: true })
  isEnabled!: boolean;

  @Column({ allowNull: true, type: DataType.DATE })
  lastCheckedAt!: Date | null;

  @Column({ allowNull: true, type: DataType.DATE })
  lastTriggeredAt!: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Tags, { foreignKey: 'tagId', onDelete: 'CASCADE' })
  tag!: Tags;

  @BelongsTo(() => Users, { foreignKey: 'userId', onDelete: 'CASCADE' })
  user!: Users;
}
