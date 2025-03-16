import { api } from '@/api/_api';
import { endpointsTypes } from '@bt/shared/types';

export const authLogin = async (payload: endpointsTypes.AuthLoginBody): Promise<endpointsTypes.AuthLoginResponse> =>
  api.post('/auth/login', payload);

export const authRegister = async (
  payload: endpointsTypes.AuthRegisterBody,
): Promise<endpointsTypes.AuthRegisterResponse> => api.post('/auth/register', payload);
