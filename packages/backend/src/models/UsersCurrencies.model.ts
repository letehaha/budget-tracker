import { NotFoundError } from '@js/errors';
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
import {
  Attribute,
  AutoIncrement,
  Default,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';

import Currencies from './Currencies.model';
import Users from './Users.model';

@Table({
  timestamps: false,
  tableName: 'UsersCurrencies',
  freezeTableName: true,
})
export default class UsersCurrencies extends Model<
  InferAttributes<UsersCurrencies>,
  InferCreationAttributes<UsersCurrencies>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.STRING(3))
  @NotNull
  @Index
  declare currencyCode: string;

  // Since base currency is always the same, here we're setting exchange rate
  // between currencyCode to user's base currency
  // TODO: probably deprecated?
  @Attribute(DataTypes.INTEGER)
  declare exchangeRate: number | null;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(false)
  declare liveRateUpdate: CreationOptional<boolean>;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(false)
  declare isDefaultCurrency: CreationOptional<boolean>;

  // In Sequelize v7, BelongsTo associations are auto-created by BelongsToMany on Users model
  declare user?: NonAttribute<Users>;
  declare currency?: NonAttribute<Currencies>;
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
  ({
    userId,
    currencyCode,
  }: {
    userId: number;
    currencyCode: string;
  }): Promise<UsersCurrencies & { currency: Currencies }>;
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
