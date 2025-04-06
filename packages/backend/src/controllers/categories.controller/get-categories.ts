import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import * as categoriesService from '@services/categories.service';

import { errorHandler } from '../helpers';

export const getCategories = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;

  try {
    const data = await categoriesService.getCategories({ userId });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
