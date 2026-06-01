import type { RecordId } from '@bt/shared/types';
import type { Money } from '@common/types/money';
import { moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import {
  Attribute,
  BelongsTo,
  Default,
  Index,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Currencies from '../currencies.model';
import Transactions from '../transactions.model';
import VentureEvents from './venture-events.model';

@Table({
  timestamps: true,
  tableName: 'VentureEventLinks',
})
export default class VentureEventLinks extends Model<
  InferAttributes<VentureEventLinks>,
  InferCreationAttributes<VentureEventLinks>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @Default(() => uuidv7())
  declare id: CreationOptional<RecordId>;

  @Attribute(DataTypes.UUID)
  @NotNull
  @Index
  declare ventureEventId: RecordId;

  @Attribute(DataTypes.UUID)
  @NotNull
  @Unique
  @Index
  declare transactionId: RecordId;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  get amount(): Money {
    return moneyGetDecimal(this, 'amount');
  }
  set amount(val: Money | string | number) {
    moneySetDecimal(this, 'amount', val, 10);
  }

  @Attribute(DataTypes.STRING(3))
  @NotNull
  @Index
  declare currencyCode: string;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare linkedAt: CreationOptional<Date>;

  @Attribute(DataTypes.JSONB)
  declare metaData: Record<string, unknown> | null;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => VentureEvents, 'ventureEventId')
  declare event?: NonAttribute<VentureEvents>;

  @BelongsTo(() => Transactions, 'transactionId')
  declare transaction?: NonAttribute<Transactions>;

  @BelongsTo(() => Currencies, 'currencyCode')
  declare currency?: NonAttribute<Currencies>;
}
