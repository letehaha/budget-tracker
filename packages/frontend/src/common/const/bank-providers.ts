import { BANK_PROVIDER_TYPE } from '@bt/shared/types';

export type PricingType = 'free' | 'paid';
export type DifficultyType = 'easy' | 'very-difficult';

interface ProviderMetainfo {
  nameKey: string;
  descriptionKey: string;
  pricingLabelKey: string;
  difficultyLabelKey: string;
  difficultyTooltipKey: string;
  pricing: PricingType;
  difficulty: DifficultyType;
}

// Translation keys for bank provider metadata
// Use t() with these keys in components to get translated strings
export const METAINFO_FROM_TYPE: Record<string, ProviderMetainfo> = {
  [BANK_PROVIDER_TYPE.MONOBANK]: {
    nameKey: 'pages.integrations.providers.monobank.name',
    descriptionKey: 'pages.integrations.providers.monobank.description',
    pricingLabelKey: 'pages.integrations.labels.free',
    difficultyLabelKey: 'pages.integrations.labels.easySetup',
    difficultyTooltipKey: 'pages.integrations.tooltips.monobank',
    pricing: 'free',
    difficulty: 'easy',
  },
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: {
    nameKey: 'pages.integrations.providers.enableBanking.name',
    descriptionKey: 'pages.integrations.providers.enableBanking.description',
    pricingLabelKey: 'pages.integrations.labels.free',
    difficultyLabelKey: 'pages.integrations.labels.veryDifficultSetup',
    difficultyTooltipKey: 'pages.integrations.tooltips.enableBanking',
    pricing: 'free',
    difficulty: 'very-difficult',
  },
  [BANK_PROVIDER_TYPE.LUNCHFLOW]: {
    nameKey: 'pages.integrations.providers.lunchflow.name',
    descriptionKey: 'pages.integrations.providers.lunchflow.description',
    pricingLabelKey: 'pages.integrations.labels.paid',
    difficultyLabelKey: 'pages.integrations.labels.easySetup',
    difficultyTooltipKey: 'pages.integrations.tooltips.lunchflow',
    pricing: 'paid',
    difficulty: 'easy',
  },
};
