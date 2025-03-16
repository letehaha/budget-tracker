import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { NotFoundError } from '@js/errors';
import * as service from '@services/tx-refunds/get-refund-for-transaction-by-id.service';

export const getRefundsForTransactionById = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = req.user;
    const transactionId = parseInt(req.query.transactionId as string);

    if (!transactionId || transactionId <= 0 || Number.isNaN(transactionId)) {
      throw new NotFoundError({ message: 'Invalid transaction ID' });
    }

    const data = await service.getRefundsForTransactionById({
      transactionId,
      userId,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
