import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import * as budgetService from '@services/budget.service';
import { errorHandler } from '../helpers';

export const getBudgets = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;

  try {
    const data = await budgetService.getBudgets({ userId });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getBudgetById = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { id: budgetId } = req.params;

  try {
    const data = await budgetService.getBudgetById({ id:budgetId, userId });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
