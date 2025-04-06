import { API_RESPONSE_STATUS, endpointsTypes } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import * as authService from '@services/auth.service';

import { errorHandler } from './helpers';

export const login = async (req, res: CustomResponse) => {
  const { username, password }: endpointsTypes.AuthLoginBody = req.body;

  try {
    const token = await authService.login({ username, password });

    return res.status(200).json<endpointsTypes.AuthLoginResponse>({
      status: API_RESPONSE_STATUS.success,
      response: token,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const register = async (req, res: CustomResponse) => {
  const { username, password }: endpointsTypes.AuthRegisterBody = req.body;

  try {
    const user = await authService.register({ username, password });

    return res.status(201).json<endpointsTypes.AuthRegisterResponse>({
      status: API_RESPONSE_STATUS.success,
      response: { user },
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const validateToken = async (req, res: CustomResponse) => {
  try {
    return res.status(200).json({ status: API_RESPONSE_STATUS.success });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};
