import { Feature } from '@bt/shared/types';

import { getEntitlementsByUserId } from './resolve-entitlements.service';

export const hasFeature = async ({ userId, feature }: { userId: number; feature: Feature }): Promise<boolean> =>
  (await getEntitlementsByUserId({ userId })).features.includes(feature);
