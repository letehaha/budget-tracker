import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { UserExchangeRatesModel } from '@bt/shared/types';
import * as Currencies from './Currencies.model';
import * as UsersCurrencies from './UsersCurrencies.model';
import Users from './Users.model';
import { NotFoundError, ValidationError } from '@js/errors';

type UserExchangeRatesAttributes = Omit<UserExchangeRatesModel, 'custom'>;

@Table({ timestamps: true, tableName: 'UserExchangeRates', freezeTableName: true, })
export default class UserExchangeRates extends Model {
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

  @ForeignKey(() => Currencies.default)
  @Column({ allowNull: false, type: DataType.INTEGER })
  baseId!: number;

  @Column({ allowNull: false, type: DataType.STRING })
  baseCode!: string;

  @ForeignKey(() => Currencies.default)
  @Column({ allowNull: false, type: DataType.INTEGER })
  quoteId!: number;

  @Column({ allowNull: false, type: DataType.STRING })
  quoteCode!: string;

  @Column({ allowNull: true, defaultValue: 1, type: DataType.NUMBER })
  rate!: number;

  // TODO:
  // 1. Add date fields to UserExchangeRates: "effectiveFrom", "effectiveTo"
  // 2. When updating rates:
  //  - Close current rate (set "effectiveTo")
  //  - Create new entry with current date as "effectiveFrom"
  // 3. For historical data:
  //  - Query UserExchangeRates with transaction date
  //  - Fall back to ExchangeRates if no user-specific rate
  // This approach will maintain the rate history for each user, allowing accurate historical calculations
}

export type ExchangeRatePair = Pick<UserExchangeRatesAttributes, 'baseCode' | 'quoteCode'>;

export async function getRates({
  userId,
  pair,
}: {
  userId: UserExchangeRatesAttributes['userId'];
  pair: ExchangeRatePair;
});
export async function getRates({
  userId,
  pairs,
}: {
  userId: UserExchangeRatesAttributes['userId'];
  pairs: ExchangeRatePair[];
});
export async function getRates({
  userId,
  pair,
  pairs,
}: {
  userId: UserExchangeRatesAttributes['userId'];
  pair?: ExchangeRatePair;
  pairs?: ExchangeRatePair[];
}) {
  const where: Record<string | symbol, unknown> = {
    userId,
  };

  if (pair && pairs) {
    throw new ValidationError({
      message: 'Only a single parameter is allowed. Passed both "pair" and "pairs".',
    });
  }
  if (!pair && !pairs) {
    throw new ValidationError({
      message: 'One of "pair" or "pairs" parameters is required.',
    });
  }

  if (pair) {
    where.baseCode = pair.baseCode;
    where.quoteCode = pair.quoteCode;
  } else if (pairs) {
    where[Op.or] = pairs.map((item) => ({
      [Op.and]: {
        baseCode: item.baseCode,
        quoteCode: item.quoteCode,
      },
    }));
  }

  return UserExchangeRates.findAll({
    where,
    raw: true,
    attributes: { exclude: ['userId'] },
  });
}

export type UpdateExchangeRatePair = Pick<UserExchangeRatesAttributes, 'baseCode' | 'quoteCode' | 'rate'>;

export async function updateRates({
  userId,
  pair,
}: {
  userId: UserExchangeRatesAttributes['userId'];
  pair: UpdateExchangeRatePair;
}): Promise<UserExchangeRates[]>;
export async function updateRates({
  userId,
  pairs,
}: {
  userId: UserExchangeRatesAttributes['userId'];
  pairs: UpdateExchangeRatePair[];
}): Promise<UserExchangeRates[]>;
export async function updateRates({
  userId,
  pair,
  pairs,
}: {
  userId: UserExchangeRatesAttributes['userId'];
  pair?: UpdateExchangeRatePair;
  pairs?: UpdateExchangeRatePair[];
}): Promise<UserExchangeRates[]> {
  const iterations = (pairs ?? [pair]) as UpdateExchangeRatePair[];
  const returningValues: UserExchangeRates[] = [];

  for (const pairItem of iterations) {
    const foundItem = await UserExchangeRates.findOne({
      where: {
        userId,
        baseCode: pairItem.baseCode,
        quoteCode: pairItem.quoteCode,
      },
      raw: true,
    });

    if (foundItem) {
      const [, updatedItems] = await UserExchangeRates.update(
        {
          rate: pairItem.rate,
        },
        {
          where: {
            userId,
            baseCode: pairItem.baseCode,
            quoteCode: pairItem.quoteCode,
          },
          returning: true,
        },
      );

      const currency = (await Currencies.default.findOne({
        where: { code: pairItem.baseCode },
        raw: true,
        attributes: ['id'],
      }))!;

      await UsersCurrencies.default.update({ liveRateUpdate: false }, { where: { userId, currencyId: currency.id } });

      if (updatedItems[0]) returningValues.push(updatedItems[0]);
    } else {
      const currencies = await Currencies.getCurrencies({
        codes: [pairItem.baseCode, pairItem.quoteCode],
      });
      const userCurrencies = await UsersCurrencies.getCurrencies({
        userId,
        ids: currencies.map((i) => i.id),
      });

      if (currencies.length !== userCurrencies.length) {
        throw new NotFoundError({
          message: 'Cannot find currencies to update rates for. Make sure wanted currencies are assigned to the user.',
        });
      }

      const baseCurrency = currencies.find((item) => item.code === pairItem.baseCode);
      const quoteCurrency = currencies.find((item) => item.code === pairItem.quoteCode);

      if (baseCurrency && quoteCurrency) {
        const res = await UserExchangeRates.create(
          {
            userId,
            rate: pairItem.rate,
            baseId: baseCurrency.id,
            baseCode: baseCurrency.code,
            quoteId: quoteCurrency.id,
            quoteCode: quoteCurrency.code,
          },
          {
            returning: true,
          },
        );

        const currency = (await Currencies.default.findOne({
          where: { code: pairItem.baseCode },
          raw: true,
          attributes: ['id'],
        }))!;
        await UsersCurrencies.default.update({ liveRateUpdate: false }, { where: { userId, currencyId: currency.id } });

        returningValues.push(res);
      } else {
        throw new NotFoundError({
          message: 'Cannot find currencies to update rates for.',
        });
      }
    }
  }

  return returningValues;
}

export async function removeRates({
  userId,
  pairs,
}: {
  userId: UserExchangeRatesAttributes['userId'];
  pairs: ExchangeRatePair[];
}): Promise<void> {
  await UserExchangeRates.destroy({
    where: {
      [Op.or]: pairs.map((item) => ({
        [Op.and]: {
          userId,
          baseCode: item.baseCode,
          quoteCode: item.quoteCode,
        },
      })),
    },
  });
}
