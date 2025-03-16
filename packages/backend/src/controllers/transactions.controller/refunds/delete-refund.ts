import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { BadRequestError } from '@js/errors';
import { removeRefundLink } from '@services/tx-refunds/remove-refund-link.service';

export const deleteRefund = async (req, res: CustomResponse) => {
  try {
    const { originalTxId, refundTxId } = req.body;
    const { id: userId } = req.user;

    const params: {
      originalTxId: number;
      refundTxId: number;
      userId: number;
    } = {
      originalTxId,
      refundTxId,
      userId,
    };

    if (!refundTxId) {
      throw new BadRequestError({
        message: 'Missing required params',
      });
    }

    await removeRefundLink(params);

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
