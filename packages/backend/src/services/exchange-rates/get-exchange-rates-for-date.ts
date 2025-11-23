import ExchangeRates from '@models/ExchangeRates.model';
import { parse } from 'date-fns';
import { Op, type WhereOptions } from 'sequelize';

export const getExchangeRatesForDate = async ({
  date,
  currencySymbols,
}: {
  date: string; // Expecting 'yyyy-mm-dd' format
  currencySymbols?: string[];
}): Promise<ExchangeRates[] | null> => {
  let whereClause: WhereOptions<ExchangeRates> = {
    date: parse(date, 'yyyy-MM-dd', new Date()),
  };

  if (currencySymbols && Array.isArray(currencySymbols)) {
    whereClause = {
      ...whereClause,
      baseCode: {
        [Op.in]: currencySymbols,
      },
    };
  }

  const rates = await ExchangeRates.findAll({ where: whereClause });

  if (!rates || rates.length === 0) {
    return null;
  }

  return rates;
};
