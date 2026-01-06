import { ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  Op,
} from '@sequelize/core';
import { Attribute, Default, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';
import cc from 'currency-codes';

import Users from './Users.model';

@Table({
  timestamps: false,
  tableName: 'Currencies',
  freezeTableName: true,
})
export default class Currencies extends Model<InferAttributes<Currencies>, InferCreationAttributes<Currencies>> {
  @Attribute(DataTypes.STRING(3))
  @PrimaryKey
  @NotNull
  declare code: string;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare currency: string;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare digits: number;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare number: number;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(false)
  declare isDisabled: CreationOptional<boolean>;

  // In Sequelize v7, BelongsToMany is defined on Users model and automatically creates the inverse
  declare users?: NonAttribute<Users[]>;
}

export const getAllCurrencies = async () => {
  const currencies = await Currencies.findAll({
    where: {
      isDisabled: { [Op.not]: true },
    },
  });

  return currencies;
};

export async function getCurrency({ currency }: { currency: string }): Promise<Currencies>;
export async function getCurrency({ number }: { number: number }): Promise<Currencies>;
export async function getCurrency({ code }: { code: string }): Promise<Currencies>;
export async function getCurrency({
  currency,
  number,
  code,
}: {
  currency?: string;
  number?: number;
  code?: string;
}): Promise<Currencies | null> {
  return Currencies.findOne({
    where: removeUndefinedKeys({ currency, number, code }),
    include: [{ model: Users }],
  });
}

export async function getCurrencies({
  currencies,
  numbers,
  codes,
}: {
  numbers?: number[];
  currencies?: string[];
  codes?: string[];
}) {
  if (currencies === undefined && codes === undefined && numbers === undefined) {
    throw new ValidationError({
      message: 'Neither "currencies", "codes" or "numbers" should be specified.',
    });
  }
  const where: Record<string, unknown> = {
    isDisabled: { [Op.not]: true },
  };

  if (currencies) where.currency = { [Op.in]: currencies };
  if (codes) where.code = { [Op.in]: codes };
  if (numbers) where.number = { [Op.in]: numbers };

  return Currencies.findAll({ where });
}

export const createCurrency = async ({ code }: { code: string }) => {
  const currency = cc.code(code);

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
    where: { code: currency.code },
    defaults: currencyData,
  });

  return result;
};
