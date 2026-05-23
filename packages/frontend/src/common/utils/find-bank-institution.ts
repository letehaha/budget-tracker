import { BANK_INSTITUTIONS, type BankInstitutionEntry } from '@/data/bank-institutions';

import { getServiceLogoUrl } from './find-subscription-service';
import { createFuzzyFinder } from './fuzzy-finder';

const findBankInstitution = createFuzzyFinder<BankInstitutionEntry>({
  items: BANK_INSTITUTIONS,
  keys: ['name', 'aliases'],
});

export function getBankInstitutionLogoUrl({ bankName }: { bankName: string }): string | null {
  const institution = findBankInstitution({ name: bankName });
  if (!institution) return null;

  return getServiceLogoUrl({ domain: institution.domain });
}
