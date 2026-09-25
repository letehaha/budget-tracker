// Finance oracle for the FIRE specs: expectations come from the FIRE spec and standard finance,
// not from the implementation. Real return via Fisher, monthly compounding, grow then contribute,
// ETA = first month the balance reaches the target within the 600-month horizon.
import { type APIRequestContext, expect } from '@playwright/test';

import { apiPatch } from './api-client';

export const HORIZON_MONTHS = 600;
export const PRESET_INFLATION_PCT = 3;
export const NOW = new Date();

export const toRealAnnual = ({ nominalPct, inflationPct }: { nominalPct: number; inflationPct: number }) =>
  (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;

export const toMonthly = ({ annual }: { annual: number }) => (1 + annual) ** (1 / 12) - 1;

export const WORLD_STOCK_REAL = toRealAnnual({ nominalPct: 8, inflationPct: PRESET_INFLATION_PCT });

export function monthsToTarget({
  balance,
  contribution,
  realAnnual,
  target,
}: {
  balance: number;
  contribution: number;
  realAnnual: number;
  target: number;
}): number | null {
  const rate = toMonthly({ annual: realAnnual });
  let b = balance;
  for (let month = 0; month <= HORIZON_MONTHS; month++) {
    if (b >= target) return month;
    b = b * (1 + rate) + contribution;
  }
  return null;
}

export const ageAt = ({ birthYear, date }: { birthYear: number; date: Date }) =>
  date.getFullYear() + (date.getMonth() + 0.5) / 12 - (birthYear + 0.5);

export const monthsUntilAge = ({ birthYear, age }: { birthYear: number; age: number }) =>
  Math.round((age - ageAt({ birthYear, date: NOW })) * 12);

export function coastHitMonth({
  balance,
  contribution,
  realAnnual,
  target,
  coastMonths,
}: {
  balance: number;
  contribution: number;
  realAnnual: number;
  target: number;
  coastMonths: number;
}): number | null {
  const rate = toMonthly({ annual: realAnnual });
  let b = balance;
  for (let month = 0; month <= HORIZON_MONTHS; month++) {
    if (b * (1 + rate) ** Math.max(0, coastMonths - month) >= target) return month;
    b = b * (1 + rate) + contribution;
  }
  return null;
}

export function requiredMonthlyContribution({
  balance,
  target,
  realAnnual,
  months,
}: {
  balance: number;
  target: number;
  realAnnual: number;
  months: number;
}) {
  const rate = toMonthly({ annual: realAnnual });
  const growth = (1 + rate) ** months;
  return Math.max(0, ((target - balance * growth) * rate) / (growth - 1));
}

export const addMonths = ({ months }: { months: number }) => new Date(NOW.getFullYear(), NOW.getMonth() + months, 1);

export const monthYear = ({ months, style }: { months: number; style: 'long' | 'short' }) =>
  addMonths({ months }).toLocaleString('en-US', { month: style, year: 'numeric' });

export const pastMonthIso = ({ monthsAgo }: { monthsAgo: number }) =>
  new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - monthsAgo, 15, 12)).toISOString();

// ─── UI text readers ─────────────────────────────────────────────────

export const squash = ({ text }: { text: string }) => text.replace(/\s+/g, ' ').trim();
export const parseMoney = ({ text }: { text: string }) => Number(text.replace(/[^\d.-]/g, ''));
export const DURATION = String.raw`\d+\s*yrs?(?:\s*\d+\s*mos?)?|\d+\s*mos?`;

export function parseDuration({ text }: { text: string }): number {
  const years = text.match(/(\d+)\s*yrs?/);
  const months = text.match(/(\d+)\s*mos?/);
  return (years ? Number(years[1]) * 12 : 0) + (months ? Number(months[1]) : 0);
}

export function parseCompact({ text }: { text: string }): number {
  const match = text.match(/\$\s*([\d.,]+)\s*([kKM]?)/);
  if (!match) throw new Error(`Not a compact amount: ${text}`);
  const unit = match[2] === 'M' ? 1e6 : match[2] ? 1e3 : 1;
  return Number(match[1]!.replace(/,/g, '')) * unit;
}

export const expectMonths = ({ actual, expected }: { actual: number | null; expected: number }) => {
  expect(actual, `expected about ${expected} months`).not.toBeNull();
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(1);
};

export const patchFireSettings = ({ request, fire }: { request: APIRequestContext; fire: Record<string, unknown> }) =>
  apiPatch({ request, path: '/api/v1/user/settings', data: { fire } });
