import { Op } from 'sequelize';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';

import { removeUndefinedKeys } from '@js/helpers';
import Users from './Users.model';
import Currencies from './Currencies.model';
import { NotFoundError } from '@js/errors';

@Table({
  timestamps: false,
  tableName: 'UsersCurrencies',
  freezeTableName: true,
})
export default class UsersCurrencies extends Model {
  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @ForeignKey(() => Users)
  @Column({ allowNull: false, type: DataType.INTEGER })
  userId!: number;

  @ForeignKey(() => Currencies)
  @Column({ allowNull: false, type: DataType.STRING(3) })
  currencyCode!: string;

  @BelongsTo(() => Users, {
    as: 'user',
    foreignKey: 'userId',
  })
  @BelongsTo(() => Currencies, {
    as: 'currency',
    foreignKey: 'currencyCode',
  })

  // Since base currency is always the same, here we're setting exchange rate
  // between currencyCode to user's base currency
  // TODO: probably deprecated?
  @Column({
    allowNull: true,
    defaultValue: null,
    type: DataType.INTEGER
  })
  exchangeRate!: number;

  @Column({
    allowNull: false,
    defaultValue: false,
    type: DataType.BOOLEAN
  })
  liveRateUpdate!: boolean;

  @Column({
    allowNull: false,
    defaultValue: false,
    type: DataType.BOOLEAN
  })
  isDefaultCurrency!: boolean;
}

export async function getCurrencies({ userId, codes }: { userId: number; codes?: string[] }) {
  const where: Record<string, unknown> = {
    userId,
  };

  if (codes) where.currencyCode = { [Op.in]: codes };

  return UsersCurrencies.findAll({
    where,
    include: { model: Currencies },
    raw: true,
    nest: true,
  });
}

export const getBaseCurrency = async ({ userId }: { userId: number }) => {
  const data = (await UsersCurrencies.findOne({
    where: { userId, isDefaultCurrency: true },
    include: { model: Currencies },
  })) as UsersCurrencies & { currency: Currencies };

  return data;
};

type getCurrencyOverload = {
  ({ userId, currencyCode }: { userId: number; currencyCode: string }): Promise<UsersCurrencies & { currency: Currencies }>;
  ({
    userId,
    isDefaultCurrency,
  }: {
    userId: number;
    isDefaultCurrency: boolean;
  }): Promise<UsersCurrencies & { currency: Currencies }>;
};
export const getCurrency: getCurrencyOverload = ({
  userId,
  currencyCode,
  isDefaultCurrency,
}: {
  userId: number;
  currencyCode?: string;
  isDefaultCurrency?: boolean;
}) => {
  return UsersCurrencies.findOne({
    where: removeUndefinedKeys({ userId, currencyCode, isDefaultCurrency }),
    include: {
      model: Currencies,
    },
  }) as Promise<UsersCurrencies & { currency: Currencies }>;
};

export const addCurrency = async ({
  userId,
  currencyCode,
  exchangeRate,
  liveRateUpdate = true,
  isDefaultCurrency,
}: {
  userId: number;
  currencyCode: string;
  exchangeRate?: number;
  liveRateUpdate?: boolean;
  isDefaultCurrency?: boolean;
}) => {
  const currency = await Currencies.findByPk(currencyCode);

  if (!currency) {
    console.log("currencyCode", currencyCode);
    throw new NotFoundError({
      message: 'Currency with provided code does not exist!',
    });
  }

  const existingCurrency = await UsersCurrencies.findOne({
    where: { userId, currencyCode },
    raw: true,
  });
  if (existingCurrency) return existingCurrency;

  return UsersCurrencies.create(
    {
      userId,
      currencyCode,
      exchangeRate,
      liveRateUpdate,
      isDefaultCurrency,
    },
    {
      returning: true,
      raw: true,
    },
  );
};

export const updateCurrency = async ({
  userId,
  currencyCode,
  exchangeRate,
  liveRateUpdate,
  isDefaultCurrency,
}: {
  userId: number;
  currencyCode: string;
  exchangeRate?: number;
  liveRateUpdate?: boolean;
  isDefaultCurrency?: boolean;
}) => {
  const where = { userId, currencyCode };

  await UsersCurrencies.update(
    {
      exchangeRate,
      liveRateUpdate,
      isDefaultCurrency,
    },
    {
      where,
    },
  );

  const currency = await getCurrency(where);

  return currency;
};

export const deleteCurrency = async ({ userId, currencyCode }: { userId: number; currencyCode: string }) => {
  const where = { userId, currencyCode };

  return UsersCurrencies.destroy({
    where,
  });
};

export const updateCurrencies = async ({
  userId,
  currencyCodes,
  exchangeRate,
  liveRateUpdate,
  isDefaultCurrency,
}: {
  userId: number;
  currencyCodes?: string[];
  exchangeRate?: number;
  liveRateUpdate?: boolean;
  isDefaultCurrency?: boolean;
}) => {
  const where: {
    userId: number;
    currencyCode?: { [Op.in]: string[] };
  } = { userId };

  if (currencyCodes?.length) {
    where.currencyCode = {
      [Op.in]: currencyCodes,
    };
  }

  await UsersCurrencies.update(
    {
      exchangeRate,
      liveRateUpdate,
      isDefaultCurrency,
    },
    {
      where,
    },
  );

  return UsersCurrencies.findAll({
    where,
  });
};
