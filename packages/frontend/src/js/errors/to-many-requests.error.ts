/**
 * Too many requests error.
 *
 * @class
 */
export class TooManyRequestsError extends Error {
  data;

  constructor(message: string, data: unknown) {
    super(message);

    this.data = data;
  }
}
