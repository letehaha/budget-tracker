import { SECURITY_PROVIDER, ASSET_CLASS } from '@bt/shared/types/investments';
import { Table, Column, Model, DataType, HasMany, Index, BeforeCreate, BeforeUpdate } from 'sequelize-typescript';

import Holdings from './Holdings.model';
import InvestmentTransactions from './InvestmentTransaction.model';
import SecurityPricing from './SecurityPricing.model';

@Table({
  tableName: 'Securities',
  freezeTableName: true,
  timestamps: true,
})
export default class Securities extends Model {
  @Column({
    primaryKey: true,
    autoIncrement: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @Column({ type: DataType.STRING, allowNull: true })
  name!: string | null;

  @Index
  @Column({ type: DataType.STRING, allowNull: true })
  symbol!: string | null;

  @Index
  @Column({ type: DataType.STRING, allowNull: true })
  cusip!: string | null;

  @Index
  @Column({ type: DataType.STRING, allowNull: true })
  isin!: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  sharesPerContract!: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  currencyCode!: string;

  @Column({ type: DataType.STRING, allowNull: true })
  cryptoCurrencyCode!: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  pricingLastSyncedAt!: Date | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  isBrokerageCash!: boolean;

  @Column({ type: DataType.STRING, allowNull: true })
  exchangeAcronym!: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  exchangeMic!: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  exchangeName!: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(SECURITY_PROVIDER)),
    allowNull: false,
  })
  providerName!: SECURITY_PROVIDER;

  @Column({
    type: DataType.ENUM(...Object.values(ASSET_CLASS)),
    allowNull: false,
  })
  assetClass!: ASSET_CLASS;

  @Column({ type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare updatedAt: Date;

  @HasMany(() => Holdings)
  holdings?: Holdings[];

  @HasMany(() => InvestmentTransactions)
  investmentTransactions?: InvestmentTransactions[];

  @HasMany(() => SecurityPricing)
  pricing?: SecurityPricing[];

  @BeforeCreate
  @BeforeUpdate
  static validateSecurity(instance: Securities) {
    if (!instance.symbol && !instance.cusip && !instance.isin) {
      throw new Error('At least one of symbol, cusip, or isin must be provided');
    }
  }
}
