import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { NotFoundError } from '@js/errors';
import { getRefund as getRefundService } from '@services/tx-refunds/get-refund.service';

export const getRefund = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = req.user;
    const originalTxId = parseInt(req.query.originalTxId as string, 10);
    const refundTxId = parseInt(req.query.refundTxId as string, 10);

    if (isNaN(originalTxId) || isNaN(refundTxId)) {
      throw new NotFoundError({ message: 'Invalid transaction IDs provided' });
    }

    const data = await getRefundService({
      originalTxId,
      refundTxId,
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
