import { AIFeatureStatus, AI_FEATURE, FEATURES } from '@bt/shared/types';
import { getRequestFeatureAccess } from '@middlewares/entitlements';
import type { StoredAiSettings } from '@models/user-settings.model';
import { resolveFeatureStatus } from '@services/user-settings/resolve-feature-model-display';
import type { Request } from 'express';

/** Receipt parsing also gets the server model on a free try of invoice matching, as `matchInvoice` grants it. */
export const resolveServerKeysAllowed = async ({
  req,
  feature,
}: {
  req: Request;
  feature: AI_FEATURE;
}): Promise<boolean> => {
  if ((await getRequestFeatureAccess({ req, feature: FEATURES.operator_ai })) === 'plan') return true;

  return (
    feature === AI_FEATURE.receiptParsing &&
    (await getRequestFeatureAccess({ req, feature: FEATURES.invoice_matching })) === 'trial'
  );
};

export async function buildFeatureStatusPayload({
  req,
  feature,
  aiSettings,
}: {
  req: Request;
  feature: AI_FEATURE;
  aiSettings: StoredAiSettings | null;
}): Promise<AIFeatureStatus> {
  return resolveFeatureStatus({
    feature,
    aiSettings,
    serverKeysAllowed: await resolveServerKeysAllowed({ req, feature }),
  });
}
