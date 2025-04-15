import { Table, Column, Model, ForeignKey } from 'sequelize-typescript';
import { Op } from 'sequelize';
import Currencies from './Currencies.model';

@Table({
  timestamps: true,
  createdAt: 'date',
  updatedAt: false,
})
export default class ExchangeRates extends Model {
  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
  })
  declare id: number;

  @ForeignKey(() => Currencies)
  @Column({ allowNull: false })
  baseId!: number;

  @Column({ allowNull: false })
  baseCode!: string;

  @ForeignKey(() => Currencies)
  @Column({ allowNull: false })
  quoteId!: number;

  @Column({ allowNull: false })
  quoteCode!: string;

  @Column({ allowNull: true, defaultValue: 1 })
  rate!: number;

  @Column({ allowNull: false })
  date!: Date;
}

export async function getRatesForCurrenciesPairs(
  pairs: {
    baseCode: string;
    quoteCode: string;
  }[],
) {
  return ExchangeRates.findAll({
    where: {
      [Op.or]: pairs.map((item) => ({
        [Op.and]: {
          baseCode: item.baseCode,
          quoteCode: item.quoteCode,
        },
      })),
    },
    raw: true,
  });
}
