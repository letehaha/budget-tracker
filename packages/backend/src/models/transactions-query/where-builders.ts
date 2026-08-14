import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { Op, WhereOptions, literal } from 'sequelize';

import { BalanceAdjustmentsPolicy, CapPolicy, CompletenessPolicy, PlannedPolicy, TransfersPolicy } from './policies';

export const plannedWhere = ({ policy }: { policy: PlannedPolicy }): WhereOptions => {
  if (policy === 'include') return {};
  if (policy === 'exclude') return { isPlanned: false };
  if (policy === 'only') return { isPlanned: true };

  return { [Op.or]: [{ isPlanned: false }, { userId: policy.visibleTo }] };
};

export const balanceAdjustmentsWhere = ({ policy }: { policy: BalanceAdjustmentsPolicy }): WhereOptions => {
  if (policy === 'include') return {};

  // `NULL @> ...` yields NULL (not false), so the IS NULL branch is required to
  // keep rows that have no externalData at all.
  return literal(
    `("Transactions"."externalData" IS NULL OR NOT ("Transactions"."externalData" @> '{"balanceAdjustment": true}'))`,
  );
};

export const transfersWhere = ({ policy }: { policy?: TransfersPolicy }): WhereOptions => {
  if (policy === undefined || policy === 'include') return {};
  if (policy === 'exclude') return { transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer };
  if (policy === 'only') return { transferNature: { [Op.ne]: TRANSACTION_TRANSFER_NATURE.not_transfer } };

  return { transferNature: { [Op.in]: policy.natures } };
};

export const isEmptyFragment = (fragment: unknown): boolean => {
  if (typeof fragment !== 'object' || fragment === null) return false;
  if (Object.getPrototypeOf(fragment) !== Object.prototype) return false;

  return Object.keys(fragment).length === 0 && Object.getOwnPropertySymbols(fragment).length === 0;
};

export type ComposedWhere = { [Op.and]: WhereOptions[] };

/**
 * Op.and composition is load-bearing: policy clauses must never collide with caller
 * keys or clobber a caller's Op.or (the failure mode that disqualified defaultScope).
 */
export const composeWhere = ({
  fragments,
  where,
}: {
  fragments: WhereOptions[];
  where?: WhereOptions;
}): ComposedWhere => ({
  [Op.and]: [...fragments, ...(where ? [where] : [])].filter((fragment) => !isEmptyFragment(fragment)),
});

export const completenessToPagination = ({
  completeness,
}: {
  completeness: CompletenessPolicy;
}): { limit?: number; offset?: number } => {
  if (completeness === 'all') return {};
  if (completeness === 'probe') return { limit: 1 };
  if ('page' in completeness) return { limit: completeness.page.limit, offset: completeness.page.offset };

  return { limit: completeness.cap.limit };
};

export const capPolicy = ({ completeness }: { completeness: CompletenessPolicy }): CapPolicy | null =>
  typeof completeness === 'object' && 'cap' in completeness ? completeness.cap : null;

/**
 * The probe Error has to be created at the query site before any await, so its stack still
 * holds the caller's frames — that is what lets the truncation log name the site that
 * set the cap. `ignoreFile` drops the query site's own frames.
 */
export const callerFrame = ({ probe, ignoreFile }: { probe: Error; ignoreFile: string }): string => {
  const frames = (probe.stack ?? '').split('\n').slice(1);

  return frames.find((frame) => !frame.includes(ignoreFile))?.trim() ?? 'unknown caller';
};
