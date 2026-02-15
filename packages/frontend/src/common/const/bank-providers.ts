import { BANK_PROVIDER_TYPE } from '@bt/shared/types';

// Translation keys for bank provider metadata
// Use t() with these keys in components to get translated strings
export const METAINFO_FROM_TYPE = {
  [BANK_PROVIDER_TYPE.MONOBANK]: {
    nameKey: 'pages.integrations.providers.monobank.name',
    descriptionKey: 'pages.integrations.providers.monobank.description',
  },
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: {
    nameKey: 'pages.integrations.providers.enableBanking.name',
    descriptionKey: 'pages.integrations.providers.enableBanking.description',
  },
  [BANK_PROVIDER_TYPE.LUNCHFLOW]: {
    nameKey: 'pages.integrations.providers.lunchflow.name',
    descriptionKey: 'pages.integrations.providers.lunchflow.description',
  },
};
