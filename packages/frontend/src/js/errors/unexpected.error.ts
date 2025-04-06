/**
 * Too many requests error.
 *
 * @class
 */
export class UnexpectedError extends Error {
  data;

  constructor(message?: string, data?: unknown) {
    super(message || 'Unexpected error');

    this.data = data;
  }
}
