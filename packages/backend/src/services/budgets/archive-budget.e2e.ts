import { BUDGET_STATUSES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Archive Budget', () => {
  it('archives a budget', async () => {
    const budget = await helpers.createCustomBudget({
      name: 'Budget to archive',
      raw: true,
    });

    expect(budget.status).toBe(BUDGET_STATUSES.active);

    const archived = await helpers.archiveCustomBudget({
      id: budget.id,
      isArchived: true,
      raw: true,
    });

    expect(archived.status).toBe(BUDGET_STATUSES.archived);
  });

  it('unarchives a budget', async () => {
    const budget = await helpers.createCustomBudget({
      name: 'Budget to unarchive',
      raw: true,
    });

    await helpers.archiveCustomBudget({
      id: budget.id,
      isArchived: true,
      raw: true,
    });

    const unarchived = await helpers.archiveCustomBudget({
      id: budget.id,
      isArchived: false,
      raw: true,
    });

    expect(unarchived.status).toBe(BUDGET_STATUSES.active);
  });

  it('archived budgets are hidden from GET /budgets by default', async () => {
    const budget = await helpers.createCustomBudget({
      name: 'Hidden budget',
      raw: true,
    });

    await helpers.archiveCustomBudget({
      id: budget.id,
      isArchived: true,
      raw: true,
    });

    const budgets = await helpers.getCustomBudgets({ raw: true });
    const found = budgets.find((b) => b.id === budget.id);

    expect(found).toBeUndefined();
  });

  it('archived budgets appear when status=active,archived', async () => {
    const budget = await helpers.createCustomBudget({
      name: 'Visible archived budget',
      raw: true,
    });

    await helpers.archiveCustomBudget({
      id: budget.id,
      isArchived: true,
      raw: true,
    });

    const budgets = await helpers.getCustomBudgets({
      status: 'active,archived',
      raw: true,
    });
    const found = budgets.find((b) => b.id === budget.id);

    expect(found).toBeDefined();
    expect(found!.status).toBe(BUDGET_STATUSES.archived);
  });

  it('can filter for only archived budgets', async () => {
    const activeBudget = await helpers.createCustomBudget({
      name: 'Active budget',
      raw: true,
    });

    const archivedBudget = await helpers.createCustomBudget({
      name: 'Archived only budget',
      raw: true,
    });

    await helpers.archiveCustomBudget({
      id: archivedBudget.id,
      isArchived: true,
      raw: true,
    });

    const budgets = await helpers.getCustomBudgets({
      status: 'archived',
      raw: true,
    });

    expect(budgets.find((b) => b.id === archivedBudget.id)).toBeDefined();
    expect(budgets.find((b) => b.id === activeBudget.id)).toBeUndefined();
  });

  it('returns 404 when archiving a non-existent budget', async () => {
    const response = await helpers.archiveCustomBudget({
      id: 999999,
      isArchived: true,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });
});
