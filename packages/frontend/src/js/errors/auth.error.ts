import { ApiBaseError } from '@/common/types';

/**
 * Authorization error.
 *
 * @class
 */
export class AuthError extends Error {
  data: ApiBaseError;
  url?: string;

  constructor(data: ApiBaseError, url?: string) {
    const code = data?.code ?? 'unknown';
    const detail = data?.message ?? data?.statusText ?? 'no detail';
    const where = url ? ` @ ${url}` : '';
    super(`[${code}] ${detail}${where}`);

    this.name = 'AuthError';
    this.data = data;
    this.url = url;
  }
}
