import type { EnableBankingBalance } from '../types';

export function balancesForLog({ balances }: { balances: EnableBankingBalance[] }) {
  // Raw ASPSP records can miss fields the type declares required; `?? null` keeps
  // the gap visible in the logged JSON instead of dropping the key.
  return balances.map((b) => ({
    balance_type: b.balance_type,
    amount: b.balance_amount?.amount ?? null,
    currency: b.balance_amount?.currency ?? null,
    reference_date: b.reference_date ?? null,
  }));
}
