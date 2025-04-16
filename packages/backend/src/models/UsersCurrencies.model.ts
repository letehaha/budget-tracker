import { Op } from 'sequelize';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';

import { removeUndefinedKeys } from '@js/helpers';
import Users from './Users.model';
import Currencies from './Currencies.model';
import { NotFoundError } from '@js/errors';

@Table({
  timestamps: false,
})
export default class UsersCurrencies extends Model {
  @BelongsTo(() => Users, {
    as: 'user',
    foreignKey: 'userId',
  })
  @BelongsTo(() => Currencies, {
    as: 'currency',
    foreignKey: 'currencyId',
  })
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
  @Column({ allowNull: false, type: DataType.INTEGER })
  currencyId!: number;

  // Since base currency is always the same, here we're setting exchange rate
  // between currencyId to user's base currency
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

export async function getCurrencies({ userId, ids }: { userId: number; ids?: number[] }) {
  const where: Record<string, unknown> = {
    userId,
  };

  if (ids) where.currencyId = { [Op.in]: ids };

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
  ({ userId, currencyId }: { userId: number; currencyId: number }): Promise<UsersCurrencies & { currency: Currencies }>;
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
  currencyId,
  isDefaultCurrency,
}: {
  userId: number;
  currencyId?: number;
  isDefaultCurrency?: boolean;
}) => {
  return UsersCurrencies.findOne({
    where: removeUndefinedKeys({ userId, currencyId, isDefaultCurrency }),
    include: {
      model: Currencies,
    },
  }) as Promise<UsersCurrencies & { currency: Currencies }>;
};

export const addCurrency = async ({
  userId,
  currencyId,
  exchangeRate,
  liveRateUpdate = true,
  isDefaultCurrency,
}: {
  userId: number;
  currencyId: number;
  exchangeRate?: number;
  liveRateUpdate?: boolean;
  isDefaultCurrency?: boolean;
}) => {
  const currency = await Currencies.findByPk(currencyId);
  if (!currency) {
    throw new NotFoundError({
      message: 'Currency with provided id does not exist!',
    });
  }

  const existingCurrency = await UsersCurrencies.findOne({
    where: { userId, currencyId },
    raw: true,
  });
  if (existingCurrency) return existingCurrency;

  return UsersCurrencies.create(
    {
      userId,
      currencyId,
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
  currencyId,
  exchangeRate,
  liveRateUpdate,
  isDefaultCurrency,
}: {
  userId: number;
  currencyId: number;
  exchangeRate?: number;
  liveRateUpdate?: boolean;
  isDefaultCurrency?: boolean;
}) => {
  const where = { userId, currencyId };

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

export const deleteCurrency = async ({ userId, currencyId }: { userId: number; currencyId: number }) => {
  const where = { userId, currencyId };

  return UsersCurrencies.destroy({
    where,
  });
};

export const updateCurrencies = async ({
  userId,
  currencyIds,
  exchangeRate,
  liveRateUpdate,
  isDefaultCurrency,
}: {
  userId: number;
  currencyIds?: number[];
  exchangeRate?: number;
  liveRateUpdate?: boolean;
  isDefaultCurrency?: boolean;
}) => {
  const where: {
    userId: number;
    currencyId?: { [Op.in]: number[] };
  } = { userId };

  if (currencyIds?.length) {
    where.currencyId = {
      [Op.in]: currencyIds,
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
