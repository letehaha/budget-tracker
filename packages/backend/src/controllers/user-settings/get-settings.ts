import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import * as useSettingsService from '@services/user-settings/get-user-settings';

import { errorHandler } from '../helpers';

export const getUserSettings = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = req.user;
    const result = await useSettingsService.getUserSettings({ userId });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
