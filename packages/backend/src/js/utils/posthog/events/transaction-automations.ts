import type { AutomationAction, AutomationConditions } from '@bt/shared/types';

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
