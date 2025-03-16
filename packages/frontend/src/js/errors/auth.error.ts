import { ApiBaseError } from '@/common/types';

/**
 * Authorization error.
 *
 * @class
 */
export class AuthError extends Error {
  data;

  constructor(message: string, data: ApiBaseError) {
    super(message);

    this.data = data;
  }
}
