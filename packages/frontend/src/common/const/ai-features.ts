import { AI_FEATURE } from '@bt/shared/types';

interface AIFeatureDisplayInfoKeys {
  nameKey: string;
  descriptionKey: string;
}

/**
 * Display information for AI features (translation keys).
 * This is kept in the frontend since it's purely presentation data.
 *
 * Using Record<AI_FEATURE, ...> ensures TypeScript will error at compile time
 * if a new AI_FEATURE is added but not included here.
 *
 * Use with t() from vue-i18n: t(info.nameKey), t(info.descriptionKey)
 */
const AI_FEATURE_DISPLAY_INFO: Record<AI_FEATURE, AIFeatureDisplayInfoKeys> = {
  [AI_FEATURE.categorization]: {
    nameKey: 'common.aiFeatures.categorization.name',
    descriptionKey: 'common.aiFeatures.categorization.description',
  },
  [AI_FEATURE.statementParsing]: {
    nameKey: 'common.aiFeatures.statementParsing.name',
    descriptionKey: 'common.aiFeatures.statementParsing.description',
  },
};

/**
 * Get display info for an AI feature.
 * Returns translation keys - use with t() from vue-i18n.
 */
export function getAIFeatureDisplayInfo({ feature }: { feature: AI_FEATURE }): AIFeatureDisplayInfoKeys {
  return AI_FEATURE_DISPLAY_INFO[feature];
}
