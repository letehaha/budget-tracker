import { API_ERROR_CODES, API_RESPONSE_STATUS, UserModel } from '@bt/shared/types';
import { CustomResponse } from '@common/types';

import { getUsers as getUsersModel } from '../models/Users.model';

export const getUsers = async (req, res: CustomResponse) => {
  try {
    const users: UserModel[] = await getUsersModel();

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: users,
    });
  } catch (err) {
    return res.status(500).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Unexpected error.',
        code: API_ERROR_CODES.unexpected,
      },
    });
  }
};
