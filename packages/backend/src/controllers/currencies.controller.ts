import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { getAllSystemCurrencies } from '@services/system-currencies';

export const getAllCurrencies = async (req, res: CustomResponse) => {
  try {
    const data = await getAllSystemCurrencies();

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
