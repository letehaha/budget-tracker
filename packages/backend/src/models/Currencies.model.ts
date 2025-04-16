import cc from 'currency-codes';
import { Op } from 'sequelize';
import {
  Table,
  Column,
  Model,
  BelongsToMany,
  DataType,
} from 'sequelize-typescript';
import Users from './Users.model';
import UsersCurrencies from './UsersCurrencies.model';
import { ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';

@Table({
  timestamps: false,
})
export default class Currencies extends Model {
  @BelongsToMany(() => Users, {
    as: 'users',
    through: () => UsersCurrencies,
  })
  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @Column({
    allowNull: false,
    type: DataType.STRING,
  })
  currency!: string;

  @Column({
    allowNull: false,
    type: DataType.INTEGER,
  })
  digits!: number;

  @Column({
    allowNull: false,
    type: DataType.INTEGER,
  })
  number!: number;

  @Column({
    allowNull: false,
    type: DataType.STRING,
  })
  code!: string;

  @Column({ allowNull: false, defaultValue: false, type: DataType.BOOLEAN })
  isDisabled!: boolean;
}

export const getAllCurrencies = async () => {
  const currencies = await Currencies.findAll({
    where: {
      isDisabled: { [Op.not]: true },
    },
  });

  return currencies;
};

export async function getCurrency({ id }: { id: number }): Promise<Currencies>;
export async function getCurrency({ currency }: { currency: string }): Promise<Currencies>;
export async function getCurrency({ number }: { number: number }): Promise<Currencies>;
export async function getCurrency({ code }: { code: string }): Promise<Currencies>;
export async function getCurrency({
  id,
  currency,
  number,
  code,
}: {
  id?: number;
  currency?: string;
  number?: number;
  code?: string;
}): Promise<Currencies | null> {
  return Currencies.findOne({
    where: removeUndefinedKeys({ id, currency, number, code }),
    include: [{ model: Users }],
  });
}

export async function getCurrencies({
  ids,
  currencies,
  numbers,
  codes,
}: {
  ids?: number[];
  numbers?: number[];
  currencies?: string[];
  codes?: string[];
}) {
  if (ids === undefined && currencies === undefined && codes === undefined && numbers === undefined) {
    throw new ValidationError({
      message: 'Neither "ids", "currencies" or "codes" should be specified.',
    });
  }
  const where: Record<string, unknown> = {
    isDisabled: { [Op.not]: true },
  };

  if (ids) where.id = { [Op.in]: ids };
  if (currencies) where.currency = { [Op.in]: currencies };
  if (codes) where.code = { [Op.in]: codes };
  if (numbers) where.number = { [Op.in]: numbers };

  return Currencies.findAll({ where });
}

export const createCurrency = async ({ code }: { code: number }) => {
  const currency = cc.number(String(code));

  if (!currency) {
    return null;
  }

  if (!currency) {
    throw new ValidationError({
      message: `Currency with code {code} is not found.`,
    });
  }

  const currencyData = {
    code: currency.code,
    number: Number(currency.number),
    digits: currency.digits,
    currency: currency.currency,
  };
  const [result] = await Currencies.findOrCreate({
    where: { number: code },
    defaults: currencyData,
  });

  return result;
};
