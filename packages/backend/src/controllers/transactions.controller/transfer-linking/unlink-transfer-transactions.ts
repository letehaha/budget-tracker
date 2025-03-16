import { API_RESPONSE_STATUS, endpointsTypes } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { ValidationError } from '@js/errors';
import * as transactionsService from '@services/transactions';

export const unlinkTransferTransactions = async (req, res: CustomResponse) => {
  try {
    const { transferIds }: endpointsTypes.UnlinkTransferTransactionsBody = req.body;
    const { id: userId } = req.user;

    if (!transferIds || !Array.isArray(transferIds)) {
      throw new ValidationError({
        message: '"transferIds" field is required and should be an array if transferIds.',
      });
    }

    const data = await transactionsService.unlinkTransferTransactions({
      userId,
      transferIds: [...new Set(transferIds)],
    });

    return res.status(200).json({ status: API_RESPONSE_STATUS.success, response: data });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
