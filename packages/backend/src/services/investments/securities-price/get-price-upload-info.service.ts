import { NotFoundError } from '@js/errors';
import ExchangeRates from '@models/ExchangeRates.model';
import { FRANKFURTER_START_DATE } from '@root/services/exchange-rates/frankfurter.service';
import { Op } from 'sequelize';

interface getPriceUploadInfo {
  currencyCode: string;
}

const MIN_ALLOWED_DATE = FRANKFURTER_START_DATE;

export const getPriceUploadInfo = async (params: getPriceUploadInfo) => {
  const { currencyCode } = params;

  // Get or create the security from search result (skip price fetch - we're uploading them manually)
  const oldestRate = await ExchangeRates.findOne({
    where: {
      [Op.or]: [{ baseCode: currencyCode }, { quoteCode: currencyCode }],
      date: {
        [Op.gte]: MIN_ALLOWED_DATE,
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
    minAllowedDate: MIN_ALLOWED_DATE,
  };
};
