/**
 * Shared between the balance-trend and net-worth widgets. Each widget persists its
 * own config keys (`include*InTotal` vs `include*`) and maps them onto this shape,
 * so renaming either widget's stored keys is never required.
 */
export interface NetWorthIncludeSettings {
  includeVentures: boolean;
  includeVehicles: boolean;
  includeLoans: boolean;
}

export interface NetWorthComponentBalances {
  accountsBalance: number;
  portfoliosBalance: number;
  venturesBalance: number;
  vehiclesBalance: number;
  loansBalance: number;
  totalBalance: number;
}

export function composeNetWorth({
  point,
  settings,
}: {
  point: NetWorthComponentBalances;
  settings: NetWorthIncludeSettings;
}): number {
  // With nothing excluded the server-computed total is authoritative.
  if (settings.includeVentures && settings.includeVehicles && settings.includeLoans) {
    return point.totalBalance;
  }

  let total = point.accountsBalance + point.portfoliosBalance;
  if (settings.includeVentures) total += point.venturesBalance;
  if (settings.includeVehicles) total += point.vehiclesBalance;
  // Loan balances are negative: including them subtracts debt, excluding them ignores it.
  if (settings.includeLoans) total += point.loansBalance;
  return total;
}
