import { BANK_INSTITUTIONS, type BankInstitutionEntry } from '@/data/bank-institutions';
import Fuse from 'fuse.js';

import { getServiceLogoUrl } from './find-subscription-service';

const fuse = new Fuse(BANK_INSTITUTIONS, {
  keys: ['name', 'aliases'],
  threshold: 0.3,
  includeScore: true,
});

function findBankInstitution({ name }: { name: string }): BankInstitutionEntry | null {
  if (!name.trim()) return null;

  const results = fuse.search(name);
  if (!results.length) return null;

  const best = results[0]!;
  if (best.score !== undefined && best.score > 0.3) return null;

  return best.item;
}

export function getBankInstitutionLogoUrl({ bankName }: { bankName: string }): string | null {
  const institution = findBankInstitution({ name: bankName });
  if (!institution) return null;

  return getServiceLogoUrl({ domain: institution.domain });
}
