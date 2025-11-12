import { BANK_PROVIDER_TYPE } from '@bt/shared/types';

export const METAINFO_FROM_TYPE = {
  [BANK_PROVIDER_TYPE.MONOBANK]: {
    name: 'Monobank',
    description: 'Ukrainian digital bank',
  },
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: {
    name: 'Enable Banking',
    description: 'Access 6000+ European banks via PSD2 open banking',
  },
};
