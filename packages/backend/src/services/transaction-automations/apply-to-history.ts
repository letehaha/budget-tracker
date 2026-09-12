import type { AutomationApplyResult, RecordId } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { trackAutomationAppliedToHistory } from '@js/utils/posthog';
import TransactionAutomations from '@models/transaction-automations.model';
import { withTransaction } from '@services/common/with-transaction';

import { applyActions } from './apply-actions';
import { scanAutomationMatches } from './preview';
import { validateAutomationRefs } from './references';

/**
 * Applies one saved rule to the submitted historical rows. The rule's conditions are
 * re-evaluated here, so an id that no longer matches or became ineligible is skipped
 * rather than written. `matchCount` stays untouched: it counts live firings.
 */
// ponytail: one transaction over up to 500 rows with per-row hooks; chunk or queue it if it times out.
export const applyAutomationToHistory = withTransaction(
  async ({
    userId,
    ruleId,
    transactionIds,
  }: {
    userId: number;
    ruleId: RecordId;
    transactionIds: RecordId[];
  }): Promise<AutomationApplyResult> => {
    const rule = await findOrThrowNotFound({
      query: TransactionAutomations.findOne({ where: { id: ruleId, userId } }),
      message: t({ key: 'automations.automationNotFound' }),
    });

    await validateAutomationRefs({ userId, conditions: rule.conditions, actions: rule.actions });

    const { rows } = await scanAutomationMatches({ userId, conditions: rule.conditions, transactionIds });

    const categorizedAt = new Date().toISOString();
    const appliedIds = new Set<RecordId>();

    for (const row of rows) {
      const applied = await applyActions({ transaction: row, rule, userId, skipSetCategory: false, categorizedAt });
      if (applied) appliedIds.add(row.id);
    }

    trackAutomationAppliedToHistory({
      userId,
      ruleId,
      requestedCount: transactionIds.length,
      appliedCount: appliedIds.size,
      actionTypes: [...new Set(rule.actions.map((action) => action.type))],
    });

    return {
      appliedCount: appliedIds.size,
      skippedIds: transactionIds.filter((id) => !appliedIds.has(id)),
      categorizedAt,
    };
  },
);
