import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { createSingleRefund } from '@services/tx-refunds/create-single-refund.service';

export const createRefund = async (req, res: CustomResponse) => {
  try {
    const { originalTxId, refundTxId } = req.body;
    const { id: userId } = req.user;

    const params = {
      originalTxId,
      refundTxId,
      userId,
    };

    const data = await createSingleRefund(params);

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
