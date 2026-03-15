import { ASSET_CLASS, SECURITY_PROVIDER, SecurityModel } from '@bt/shared/types/investments';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import {
  Attribute,
  AutoIncrement,
  BeforeCreate,
  BeforeUpdate,
  Default,
  HasMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';

import Holdings from './Holdings.model';
import InvestmentTransactions from './InvestmentTransaction.model';
import SecurityPricing from './SecurityPricing.model';

@Table({
  tableName: 'Securities',
  freezeTableName: true,
  timestamps: true,
})
export default class Securities
  extends Model<InferAttributes<Securities>, InferCreationAttributes<Securities>>
  implements SecurityModel
{
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.STRING)
  declare name: string | null;

  @Attribute(DataTypes.STRING)
  @Index
  declare symbol: string | null;

  @Attribute(DataTypes.STRING)
  @Index
  declare cusip: string | null;

  @Attribute(DataTypes.STRING)
  @Index
  declare isin: string | null;

  @Attribute(DataTypes.STRING)
  declare sharesPerContract: string | null;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare currencyCode: string;

  @Attribute(DataTypes.STRING)
  declare cryptoCurrencyCode: string | null;

  @Attribute(DataTypes.DATE)
  declare pricingLastSyncedAt: Date | null;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(false)
  declare isBrokerageCash: CreationOptional<boolean>;

  @Attribute(DataTypes.STRING)
  declare exchangeAcronym: string | null;

  @Attribute(DataTypes.STRING)
  declare exchangeMic: string | null;

  @Attribute(DataTypes.STRING)
  declare exchangeName: string | null;

  @Attribute(DataTypes.ENUM(...Object.values(SECURITY_PROVIDER)))
  @NotNull
  declare providerName: SECURITY_PROVIDER;

  @Attribute(DataTypes.ENUM(...Object.values(ASSET_CLASS)))
  @NotNull
  declare assetClass: ASSET_CLASS;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare updatedAt: CreationOptional<Date>;

  @HasMany(() => Holdings, 'securityId')
  declare holdings?: NonAttribute<Holdings[]>;

  @HasMany(() => InvestmentTransactions, 'securityId')
  declare investmentTransactions?: NonAttribute<InvestmentTransactions[]>;

  @HasMany(() => SecurityPricing, 'securityId')
  declare pricing?: NonAttribute<SecurityPricing[]>;

  @BeforeCreate
  @BeforeUpdate
  static validateSecurity(instance: Securities) {
    if (!instance.symbol && !instance.cusip && !instance.isin) {
      throw new Error('At least one of symbol, cusip, or isin must be provided');
    }
  }
}
