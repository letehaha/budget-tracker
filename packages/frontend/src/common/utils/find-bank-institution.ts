import { BANK_INSTITUTIONS, type BankInstitutionEntry } from '@/data/bank-institutions';

import { createFuzzyFinder } from './fuzzy-finder';
import { getServiceLogoUrl } from './logo-url';

const findBankInstitution = createFuzzyFinder<BankInstitutionEntry>({
  items: BANK_INSTITUTIONS,
  keys: ['name', 'aliases'],
});

export function getBankInstitutionLogoUrl({ bankName }: { bankName: string }): string | null {
  const institution = findBankInstitution({ name: bankName });
  if (!institution) return null;

  return getServiceLogoUrl({ domain: institution.domain });
}
