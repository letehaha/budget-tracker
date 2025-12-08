import { NotFoundError } from '@js/errors';
import ExchangeRates from '@models/ExchangeRates.model';
import { exchangeRateProviderRegistry } from '@services/exchange-rates/providers';
import { Op } from 'sequelize';

interface getPriceUploadInfo {
  currencyCode: string;
}

// Fallback date if no providers are registered (should not happen in practice)
const FALLBACK_MIN_DATE = new Date('1999-01-04');

function getMinAllowedDate(): Date {
  return exchangeRateProviderRegistry.getEarliestHistoricalDate() ?? FALLBACK_MIN_DATE;
}

export const getPriceUploadInfo = async (params: getPriceUploadInfo) => {
  const { currencyCode } = params;
  const minAllowedDate = getMinAllowedDate();

  // Get or create the security from search result (skip price fetch - we're uploading them manually)
  const oldestRate = await ExchangeRates.findOne({
    where: {
      [Op.or]: [{ baseCode: currencyCode }, { quoteCode: currencyCode }],
      date: {
        [Op.gte]: minAllowedDate,
      },
    },
    order: [['date', 'ASC']],
    attributes: ['date'],
    raw: true,
  });

  const newestRate = await ExchangeRates.findOne({
    where: {
      [Op.or]: [{ baseCode: currencyCode }, { quoteCode: currencyCode }],
    },
    order: [['date', 'DESC']],
    attributes: ['date'],
    raw: true,
  });

  if (!oldestRate || !newestRate) {
    throw new NotFoundError({
      message: `No exchange rates found for currency ${currencyCode}. Cannot upload prices for this security.`,
    });
  }

  return {
    oldestDate: oldestRate.date,
    newestDate: newestRate.date,
    currencyCode,
    minAllowedDate,
  };
};
