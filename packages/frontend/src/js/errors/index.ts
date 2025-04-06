import { ApiBaseError } from '@/common/types';

export * from './network.error';
export * from './auth.error';
export * from './to-many-requests.error';
export * from './unexpected.error';

export class ApiErrorResponseError extends Error {
  data: ApiBaseError;

  constructor(message: string, data: ApiBaseError) {
    super(message);

    this.data = data;
  }
}
