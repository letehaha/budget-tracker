import type { TransactionLocation } from '@bt/shared/types';

import type { UI_FORM_STRUCT } from '../types';

/**
 * `undefined` = the user never touched the location (omit from the payload),
 * `null` = cleared. A half-filled pair is blocked by form validation before it gets here.
 */
export const resolveFormLocation = ({
  latitude,
  longitude,
}: Pick<UI_FORM_STRUCT, 'latitude' | 'longitude'>): TransactionLocation | null | undefined => {
  if (latitude === undefined && longitude === undefined) return undefined;
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
};
