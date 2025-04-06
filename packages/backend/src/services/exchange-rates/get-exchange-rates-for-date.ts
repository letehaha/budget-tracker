import { logger } from '@js/utils';
import ExchangeRates from '@models/ExchangeRates.model';
import { withTransaction } from '@services/common';
import { parse } from 'date-fns';
import { Op, type WhereOptions } from 'sequelize';

export const getExchangeRatesForDate = withTransaction(
  async ({
    date,
    currencySymbols,
  }: {
    date: string; // Expecting 'yyyy-mm-dd' format
    currencySymbols?: string[];
  }): Promise<ExchangeRates[] | null> => {
    try {
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
    } catch (err) {
      logger.error(err as Error);
      return null;
    }
  },
);
