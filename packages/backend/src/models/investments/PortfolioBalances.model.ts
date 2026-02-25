import { Money } from '@common/types/money';
import { MoneyColumn, moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index, PrimaryKey } from 'sequelize-typescript';

import Currencies from '../Currencies.model';
import Portfolios from './Portfolios.model';

@Table({
  timestamps: true,
  tableName: 'PortfolioBalances',
})
export default class PortfolioBalances extends Model {
  @PrimaryKey
  @ForeignKey(() => Portfolios)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  portfolioId!: number;

  @PrimaryKey
  @ForeignKey(() => Currencies)
  @Index
  @Column({ type: DataType.STRING(3), allowNull: false })
  currencyCode!: string;

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get availableCash(): Money {
    return moneyGetDecimal(this, 'availableCash');
  }
  set availableCash(val: Money | string | number) {
    moneySetDecimal(this, 'availableCash', val, 10);
  }

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get totalCash(): Money {
    return moneyGetDecimal(this, 'totalCash');
  }
  set totalCash(val: Money | string | number) {
    moneySetDecimal(this, 'totalCash', val, 10);
  }

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get refAvailableCash(): Money {
    return moneyGetDecimal(this, 'refAvailableCash');
  }
  set refAvailableCash(val: Money | string | number) {
    moneySetDecimal(this, 'refAvailableCash', val, 10);
  }

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get refTotalCash(): Money {
    return moneyGetDecimal(this, 'refTotalCash');
  }
  set refTotalCash(val: Money | string | number) {
    moneySetDecimal(this, 'refTotalCash', val, 10);
  }

  @Column({ type: DataType.DATE, allowNull: false })
  createdAt!: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  updatedAt!: Date;

  // Associations
  @BelongsTo(() => Portfolios)
  portfolio?: Portfolios;

  @BelongsTo(() => Currencies)
  currency?: Currencies;
}
