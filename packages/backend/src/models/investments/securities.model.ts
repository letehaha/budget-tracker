import type { RecordId } from '@bt/shared/types';
import type { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import {
  Attribute,
  BeforeCreate,
  BeforeUpdate,
  Default,
  HasMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Holdings from './holdings.model';
import InvestmentTransactions from './investment-transaction.model';
import SecurityPricing from './security-pricing.model';

@Table({
  tableName: 'Securities',
  freezeTableName: true,
  timestamps: true,
})
export default class Securities extends Model<InferAttributes<Securities>, InferCreationAttributes<Securities>> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<RecordId>;

  @BeforeCreate
  static generateUUIDv7(instance: Securities) {
    if (!instance.id) {
      instance.id = uuidv7() as RecordId;
    }
  }

  @Attribute(DataTypes.STRING)
  declare name: string | null;

  @Attribute(DataTypes.STRING)
  @Index
  declare symbol: string | null;

  @Attribute(DataTypes.STRING)
  @Index
  declare providerSymbol: string | null;

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

  @Attribute(DataTypes.STRING(255))
  declare logoUrl: string | null;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare providerName: SECURITY_PROVIDER;

  @Attribute(DataTypes.STRING)
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
