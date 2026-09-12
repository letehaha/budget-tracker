import type { AutomationAction, AutomationActionType, AutomationConditions } from '@bt/shared/types';

import { trackEvent } from '../index';

/**
 * Called from the API/MCP entry points rather than from `createAutomation`: the demo
 * seed builds its rules through that same service and would drown the real signal.
 */
export function trackAutomationCreated({
  userId,
  source,
  conditions,
  actions,
}: {
  userId: string | number;
  source: 'api' | 'mcp';
  conditions: AutomationConditions;
  actions: AutomationAction[];
}): void {
  trackEvent({
    userId,
    event: 'automation_created',
    properties: {
      creation_source: source,
      match: conditions.match,
      condition_count: conditions.items.length,
      condition_fields: [...new Set(conditions.items.map((item) => item.field))],
      action_types: [...new Set(actions.map((action) => action.type))],
    },
  });
}

/**
 * One event per transaction a rule fires on. `match_count` is the rule's tally before
 * this hit, so `match_count == 0` isolates rules firing for the first time ever.
 * `action_types` is what the rule is configured to do — `set_category` can still be
 * skipped for an individual transaction.
 */
export function trackAutomationApplied({
  userId,
  ruleId,
  actions,
  matchCount,
}: {
  userId: string | number;
  ruleId: string | number;
  actions: AutomationAction[];
  matchCount: number;
}): void {
  trackEvent({
    userId,
    event: 'automation_applied',
    properties: {
      rule_id: String(ruleId),
      action_types: [...new Set(actions.map((action) => action.type))],
      match_count: matchCount,
    },
  });
}

/**
 * One event per retroactive apply run, not per row. `applied_count` trails `requested_count`
 * whenever a submitted row stopped matching or had every action skipped.
 */
export function trackAutomationAppliedToHistory({
  userId,
  ruleId,
  requestedCount,
  appliedCount,
  actionTypes,
}: {
  userId: string | number;
  ruleId: string | number;
  requestedCount: number;
  appliedCount: number;
  actionTypes: AutomationActionType[];
}): void {
  trackEvent({
    userId,
    event: 'automation_applied_to_history',
    properties: {
      rule_id: String(ruleId),
      requested_count: requestedCount,
      applied_count: appliedCount,
      action_types: actionTypes,
    },
  });
}
