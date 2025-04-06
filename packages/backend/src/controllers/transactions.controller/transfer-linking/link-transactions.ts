import { API_RESPONSE_STATUS, endpointsTypes } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { ValidationError } from '@js/errors';
import * as transactionsService from '@services/transactions';

export const linkTransactions = async (req, res: CustomResponse) => {
  try {
    const { ids }: endpointsTypes.LinkTransactionsBody = req.body;
    const { id: userId } = req.user;

    if (!ids || !Array.isArray(ids)) {
      throw new ValidationError({
        message: '"ids" field is missing or invalid.',
      });
    }

    const data = await transactionsService.linkTransactions({
      userId,
      ids,
    });

    return res.status(200).json({ status: API_RESPONSE_STATUS.success, response: data });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
