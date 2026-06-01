import { VENTURE_DEAL_STATUS } from '@bt/shared/types';

interface VentureDealStatusMeta {
  /** i18n key for the human-readable status name. */
  label: string;
  /** Tailwind classes for the badge (background/text/border). */
  cls: string;
  /** Tailwind class for the small status dot. */
  dot: string;
}

/**
 * Single source of truth for how venture deal statuses render. Pages pick
 * the fields they need — list view uses `label` + `cls`, detail view also
 * shows the `dot`.
 */
export const VENTURE_DEAL_STATUS_META: Readonly<Record<VENTURE_DEAL_STATUS, VentureDealStatusMeta>> = Object.freeze({
  [VENTURE_DEAL_STATUS.outstanding]: {
    label: 'venture.deals.status.outstanding',
    cls: 'bg-app-transfer-color/15 text-app-transfer-color border-app-transfer-color/30',
    dot: 'bg-app-transfer-color',
  },
  [VENTURE_DEAL_STATUS.partial_exit]: {
    label: 'venture.deals.status.partial_exit',
    cls: 'bg-app-income-color/15 text-app-income-color border-app-income-color/30',
    dot: 'bg-app-income-color',
  },
  [VENTURE_DEAL_STATUS.fully_exited]: {
    label: 'venture.deals.status.fully_exited',
    cls: 'bg-app-income-color/20 text-app-income-color border-app-income-color/40',
    dot: 'bg-app-income-color',
  },
  [VENTURE_DEAL_STATUS.written_off]: {
    label: 'venture.deals.status.written_off',
    cls: 'bg-destructive/15 text-destructive-text border-destructive/30',
    dot: 'bg-destructive',
  },
});
