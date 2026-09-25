import { type Entitlements, type Feature } from '@bt/shared/types';
import FeatureUsages from '@models/feature-usages.model';
import { withTransaction } from '@services/common/with-transaction';
import { QueryTypes } from 'sequelize';

import { getEntitlementsByUserId } from './resolve-entitlements.service';

/** `trialStartedAt` is set only once, so repeating the call never extends the trial. */
export const startFeatureTrial = withTransaction(
  async ({ userId, feature }: { userId: number; feature: Feature }): Promise<Entitlements> => {
    const entitlements = await getEntitlementsByUserId({ userId });
    if (entitlements.features.includes(feature)) return entitlements;

    await FeatureUsages.sequelize!.query(
      `INSERT INTO "FeatureUsages" ("userId", "feature", "trialStartedAt", "createdAt", "updatedAt")
       VALUES (:userId, :feature, NOW(), NOW(), NOW())
       ON CONFLICT ("userId", "feature")
       DO UPDATE SET "trialStartedAt" = NOW(), "updatedAt" = NOW()
       WHERE "FeatureUsages"."trialStartedAt" IS NULL`,
      { replacements: { userId, feature }, type: QueryTypes.INSERT },
    );

    return getEntitlementsByUserId({ userId });
  },
);
