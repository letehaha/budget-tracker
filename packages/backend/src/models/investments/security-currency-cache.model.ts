import { SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { Table, Column, Model, DataType } from 'sequelize-typescript';

@Table({
  tableName: 'SecurityCurrencyCaches',
  freezeTableName: true,
  timestamps: true,
})
export default class SecurityCurrencyCache extends Model {
  @Column({
    primaryKey: true,
    type: DataType.STRING,
  })
  declare symbol: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare currencyCode: string;

  @Column({
    type: DataType.ENUM(...Object.values(SECURITY_PROVIDER)),
    allowNull: false,
  })
  declare providerName: SECURITY_PROVIDER;

  @Column({ type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare updatedAt: Date;
}
