import { AIFeatureDisplayInfo, AI_FEATURE } from '@bt/shared/types';

/**
 * Display information for AI features.
 * This is kept in the frontend since it's purely presentation data.
 *
 * Using Record<AI_FEATURE, ...> ensures TypeScript will error at compile time
 * if a new AI_FEATURE is added but not included here.
 */
const AI_FEATURE_DISPLAY_INFO: Record<AI_FEATURE, AIFeatureDisplayInfo> = {
  [AI_FEATURE.categorization]: {
    name: 'Transaction Categorization',
    description: 'Automatically categorize transactions based on their description and merchant',
  },
  [AI_FEATURE.statementParsing]: {
    name: 'Statement Parser',
    description: 'Extract transactions from bank statements (PDF, CSV, TXT) using AI',
  },
};

/**
 * Get display info for an AI feature.
 */
export function getAIFeatureDisplayInfo({ feature }: { feature: AI_FEATURE }): AIFeatureDisplayInfo {
  return AI_FEATURE_DISPLAY_INFO[feature];
}
