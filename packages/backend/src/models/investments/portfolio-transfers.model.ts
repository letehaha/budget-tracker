import { Money } from '@common/types/money';
import { moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';
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
  BelongsTo,
  Default,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';

import Accounts from '../accounts.model';
import Currencies from '../currencies.model';
import Transactions from '../transactions.model';
import Users from '../users.model';
import Portfolios from './portfolios.model';

@Table({
  timestamps: true,
  tableName: 'PortfolioTransfers',
})
export default class PortfolioTransfers extends Model<
  InferAttributes<PortfolioTransfers>,
  InferCreationAttributes<PortfolioTransfers>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare fromAccountId: number | null;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare toPortfolioId: number | null;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare fromPortfolioId: number | null;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare toAccountId: number | null;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  get amount(): Money {
    return moneyGetDecimal(this, 'amount');
  }
  set amount(val: Money | string | number) {
    moneySetDecimal(this, 'amount', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  get refAmount(): Money {
    return moneyGetDecimal(this, 'refAmount');
  }
  set refAmount(val: Money | string | number) {
    moneySetDecimal(this, 'refAmount', val, 10);
  }

  @Attribute(DataTypes.STRING(3))
  @NotNull
  @Index
  declare currencyCode: string;

  @Attribute(DataTypes.DATEONLY)
  @NotNull
  @Index
  declare date: string;

  @Attribute(DataTypes.TEXT)
  declare description: string | null;

  @Attribute(DataTypes.JSONB)
  declare metaData: Record<string, unknown> | null;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare transactionId: number | null;

  @Attribute({ type: DataTypes.STRING(3), defaultValue: null })
  @Index
  declare toCurrencyCode: string | null;

  @Attribute(DataTypes.DECIMAL(20, 10))
  get toAmount(): Money | null {
    const raw = this.getDataValue('toAmount');
    if (raw === null || raw === undefined) return null;
    return moneyGetDecimal(this, 'toAmount');
  }
  set toAmount(val: Money | string | number | null) {
    if (val === null) {
      this.setDataValue('toAmount', null);
      return;
    }
    moneySetDecimal(this, 'toAmount', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(20, 10))
  get refToAmount(): Money | null {
    const raw = this.getDataValue('refToAmount');
    if (raw === null || raw === undefined) return null;
    return moneyGetDecimal(this, 'refToAmount');
  }
  set refToAmount(val: Money | string | number | null) {
    if (val === null) {
      this.setDataValue('refToAmount', null);
      return;
    }
    moneySetDecimal(this, 'refToAmount', val, 10);
  }

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Associations
  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @BelongsTo(() => Accounts, 'fromAccountId')
  declare fromAccount?: NonAttribute<Accounts>;

  @BelongsTo(() => Accounts, 'toAccountId')
  declare toAccount?: NonAttribute<Accounts>;

  @BelongsTo(() => Portfolios, 'fromPortfolioId')
  declare fromPortfolio?: NonAttribute<Portfolios>;

  @BelongsTo(() => Portfolios, 'toPortfolioId')
  declare toPortfolio?: NonAttribute<Portfolios>;

  @BelongsTo(() => Currencies, 'currencyCode')
  declare currency?: NonAttribute<Currencies>;

  @BelongsTo(() => Currencies, 'toCurrencyCode')
  declare toCurrency?: NonAttribute<Currencies>;

  @BelongsTo(() => Transactions, 'transactionId')
  declare transaction?: NonAttribute<Transactions>;
}
