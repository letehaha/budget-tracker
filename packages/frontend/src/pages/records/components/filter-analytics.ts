import { SELECTABLE_TRANSFER_NATURES, type FiltersStruct } from '@/components/records-filters/const';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { FILTER_OPERATION } from '@bt/shared/types';

/** Per-filter "does it narrow the result" predicates, keyed by the analytics name. */
const FILTER_ACTIVITY_CHECKS: Record<string, (filters: FiltersStruct) => boolean> = {
  date: (f) => f.start != null || f.end != null,
  type: (f) => f.transactionType !== null,
  accounts: (f) => f.accounts.length > 0,
  categories: (f) => f.categoryIds.length > 0,
  tags: (f) => f.tagIds.length > 0,
  payees: (f) => f.payeeIds.length > 0,
  amount: (f) => f.amountGte != null || f.amountLte != null,
  transferKinds: (f) => f.transferNatures.length !== SELECTABLE_TRANSFER_NATURES.length,
  refunds: (f) => f.refundFilter !== FILTER_OPERATION.all,
  transfers: (f) => f.transferFilter !== FILTER_OPERATION.all,
  note: (f) => f.noteIncludes.trim().length > 0,
};

/**
 * Fires `transactions_filter_used` for every filter that just transitioned from
 * its default to a narrowing value. Edge-triggered, so typing "abc" into the
 * note filter reports once, not per keystroke.
 */
export function trackNewlyActiveFilters({ previous, current }: { previous: FiltersStruct; current: FiltersStruct }) {
  for (const [filter, isActive] of Object.entries(FILTER_ACTIVITY_CHECKS)) {
    if (isActive(current) && !isActive(previous)) {
      trackAnalyticsEvent({ event: 'transactions_filter_used', properties: { filter } });
    }
  }
}
