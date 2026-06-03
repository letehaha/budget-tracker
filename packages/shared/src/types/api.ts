import type { HouseholdSharePermission } from './enums';
import type { RecordId } from './record-id';

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
  payloadTooLarge = 'PAYLOAD_TOO_LARGE',

  // auth
  unauthorized = 'UNAUTHENTICATED',
  invalidCredentials = 'INVALID_CREDENTIALS',
  userExists = 'USER_ALREADY_EXISTS',

  // currencies-related
  currencyProviderUnavailable = 'CURRENCY_PROVIDER_UNAVAILABLE',

  // sharing-related
  shareCurrencyMismatch = 'SHARE_CURRENCY_MISMATCH',
  baseCurrencyLockedByShares = 'BASE_CURRENCY_LOCKED_BY_SHARES',
  baseCurrencyLockedByHousehold = 'BASE_CURRENCY_LOCKED_BY_HOUSEHOLD',

  // wipe-data
  wipeDataSharingAcknowledgementRequired = 'WIPE_DATA_SHARING_ACK_REQUIRED',
}

/**
 * Per-relationship-kind blocker entry surfaced in `change-base-currency`'s `details`
 * payload. Discriminated by `type` so the frontend renders the right copy and routing for
 * each blocker without re-deriving the shape from the error code.
 */
export type BaseCurrencyBlocker = { type: 'household' | 'share'; count: number };

/**
 * Preflight summary returned in the `details` of a 409 with code
 * `wipeDataSharingAcknowledgementRequired`. UI uses it to render a follow-up
 * acknowledgement dialog listing which resources will lose external access.
 */
export interface WipeDataSharedResources {
  /** Accounts the user OWNS that another user currently has share access to. */
  accounts: Array<{ id: RecordId; name: string; recipientUserId: number }>;
  /** Households the user OWNS with at least one accepted member. */
  households: Array<{ shareId: RecordId; recipientUserId: number; permission: HouseholdSharePermission }>;
}
