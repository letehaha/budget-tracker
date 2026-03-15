export enum API_RESPONSE_STATUS {
  error = 'error',
  success = 'success',
}

export enum API_ERROR_CODES {
  // general
  tooManyRequests = 'TOO_MANY_REQUESTS',
  notFound = 'NOT_FOUND',
  notAllowed = 'NOT_ALLOWED',
  unexpected = 'UNEXPECTED',
  validationError = 'VALIDATION_ERROR',
  conflict = 'CONFLICT',
  categoryHasTransactions = 'CATEGORY_HAS_TRANSACTIONS',
  forbidden = 'FORBIDDEN',
  BadRequest = 'BAD_REQUEST',
  locked = 'LOCKED',
  baseCurrencyChangeInProgress = 'BASE_CURRENCY_CHANGE_IN_PROGRESS',
  badGateway = 'BAD_GATEWAY',

  // auth
  unauthorized = 'UNAUTHENTICATED',
  invalidCredentials = 'INVALID_CREDENTIALS',
  userExists = 'USER_ALREADY_EXISTS',

  // currencies-related
  currencyProviderUnavailable = 'CURRENCY_PROVIDER_UNAVAILABLE',

  // crypto/binance
  cryptoBinanceBothAPIKeysDoesNotexist = 10101,
  cryptoBinancePublicAPIKeyNotDefined = 10102,
  cryptoBinanceSecretAPIKeyNotDefined = 10103,
}
