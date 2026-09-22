import { type Feature } from '@bt/shared/types';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Users from './users.model';

@Table({
  tableName: 'FeatureUsages',
  timestamps: true,
  freezeTableName: true,
  indexes: [{ fields: ['userId', 'feature'], unique: true, name: 'feature_usages_user_id_feature_unique' }],
})
export default class FeatureUsages extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  })
  declare id: number;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare userId: number;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
  })
  declare feature: Feature;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare usedCount: number;

  @BelongsTo(() => Users)
  declare user: Users;
}
