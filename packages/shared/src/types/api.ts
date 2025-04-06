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
  forbidden = 'FORBIDDEN',
  BadRequest = 'BAD_REQUEST',
  badGateway = 'BAD_GATEWAY',

  // auth
  unauthorized = 'UNAUTHENTICATED',
  invalidCredentials = 'INVALID_CREDENTIALS',
  userExists = 'USER_ALREADY_EXISTS',

  // monobank
  monobankUserNotPaired = 'MONOBANK_USER_NOT_PAIRED',
  monobankUserAlreadyConnected = 'MONOBANK_USER_ALREADY_CONNECTED',
  monobankUserNotExist = 'MONOBANK_USER_NOT_EXIST',
  monobankTokenInvalid = 'MONOBANK_USER_TOKEN_INVALID',

  // crypto/binance
  cryptoBinanceBothAPIKeysDoesNotexist = 10101,
  cryptoBinancePublicAPIKeyNotDefined = 10102,
  cryptoBinanceSecretAPIKeyNotDefined = 10103,
}
