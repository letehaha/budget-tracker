import { BalanceStatus, type EnableBankingBalance } from '../types';

// Booked types first: available balances already subtract pending holds, which
// must not move the account balance before the bank books them.
const BALANCE_PRIORITY = [BalanceStatus.ITBD, BalanceStatus.CLBD, BalanceStatus.ITAV, BalanceStatus.CLAV];

export function pickAccountBalance({ balances }: { balances: EnableBankingBalance[] }) {
  for (const type of BALANCE_PRIORITY) {
    const balance = balances.find((b) => b.balance_type === type);
    if (balance) return balance;
  }
  return balances[0];
}

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
