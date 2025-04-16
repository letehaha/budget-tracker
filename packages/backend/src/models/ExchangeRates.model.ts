import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';
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
    type: DataType.INTEGER,
  })
  declare id: number;

  @ForeignKey(() => Currencies)
  @Column({ allowNull: false, type: DataType.INTEGER })
  baseId!: number;

  @Column({ allowNull: false, type: DataType.STRING })
  baseCode!: string;

  @ForeignKey(() => Currencies)
  @Column({ allowNull: false, type: DataType.INTEGER })
  quoteId!: number;

  @Column({ allowNull: false, type: DataType.STRING })
  quoteCode!: string;

  @Column({ allowNull: true, defaultValue: 1, type: DataType.NUMBER })
  rate!: number;

  @Column({ allowNull: false, type: DataType.DATE })
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
