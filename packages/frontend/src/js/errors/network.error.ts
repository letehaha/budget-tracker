import { ApiBaseError } from '@/common/types';

/**
 * Network error.
 *
 * @class
 */
export class NetworkError extends Error {
  data;

  constructor(message: string, data?: ApiBaseError) {
    super(message);

    this.data = data;
  }
}
