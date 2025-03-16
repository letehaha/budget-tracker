import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { SettingsSchema, ZodSettingsSchema } from '@models/UserSettings.model';
import * as userSettingsService from '@services/user-settings/update-settings';
import { z } from 'zod';

import { errorHandler } from '../helpers';

export const updateUserSettingsSchema = z.object({
  body: ZodSettingsSchema,
});

export const updateUserSettings = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = req.user;
    const settings: SettingsSchema = req.validated.body;
    const result = await userSettingsService.updateUserSettings({
      userId,
      settings,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
