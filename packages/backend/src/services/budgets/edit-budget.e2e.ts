import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { addDays, subDays } from 'date-fns';

describe('Edit Budget', () => {
  const baseBudgetMockData = {
    name: 'Original Budget',
    startDate: subDays(new Date(), 1).toISOString(),
    endDate: new Date().toISOString(),
    autoInclude: false,
    limitAmount: 1000,
  };

  it('successfully edits a budget name', async () => {
    const budget = await helpers.createCustomBudget({ ...baseBudgetMockData, raw: true });

    const newName = 'Updated Budget';
    const params = { name: newName };
    const editedBudget = await helpers.editCustomBudget({
      id: budget.id,
      raw: true,
      params,
    });

    expect(editedBudget).toMatchObject({ ...baseBudgetMockData, name: newName, id: budget.id });

    const budgetById = await helpers.getCustomBudgetById({ id: budget.id, raw: true });
    expect(budgetById?.name).toBe(newName);
  });

  it('returns error when budget is not found', async () => {
    const params = { name: 'Some name' };
    const response = await helpers.editCustomBudget({
      id: 999999,
      params,
      raw: false,
    });

    expect(response.statusCode).toEqual(ERROR_CODES.NotFoundError);
  });

  it('successfully updates multiple budget properties at once', async () => {
    const budget = await helpers.createCustomBudget({ ...baseBudgetMockData, raw: true });

    const newStartDate = subDays(new Date(), 5).toISOString();
    const newEndDate = addDays(new Date(), 5).toISOString();
    const newLimitAmount = 2500;
    const newAutoInclude = true;

    const params = {
      name: 'Completely Updated Budget',
      startDate: newStartDate,
      endDate: newEndDate,
      limitAmount: newLimitAmount,
      autoInclude: newAutoInclude,
    };

    const editedBudget = await helpers.editCustomBudget({
      id: budget.id,
      raw: true,
      params,
    });

    expect(editedBudget).toEqual(expect.objectContaining(params));
  });

  it('successfully updates only the limitAmount', async () => {
    const budget = await helpers.createCustomBudget({ ...baseBudgetMockData, raw: true });

    const newLimitAmount = 5000;
    const params = { limitAmount: newLimitAmount };

    const editedBudget = await helpers.editCustomBudget({
      id: budget.id,
      raw: true,
      params,
    });

    expect(editedBudget.limitAmount).toBe(newLimitAmount);
    expect(editedBudget.name).toBe(baseBudgetMockData.name); // Other properties remain unchanged
  });

  it('successfully toggles autoInclude flag', async () => {
    const budget = await helpers.createCustomBudget({ ...baseBudgetMockData, raw: true });

    const params = { autoInclude: true };

    const editedBudget = await helpers.editCustomBudget({
      id: budget.id,
      raw: true,
      params,
    });

    expect(editedBudget.autoInclude).toBe(true);
  });

  it('fails validation when name exceeds maximum length', async () => {
    const budget = await helpers.createCustomBudget({ ...baseBudgetMockData, raw: true });

    const tooLongName = 'A'.repeat(201);
    const params = { name: tooLongName };

    const response = await helpers.editCustomBudget({
      id: budget.id,
      params,
      raw: false,
    });

    expect(response.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('fails validation when limitAmount is negative', async () => {
    const budget = await helpers.createCustomBudget({ ...baseBudgetMockData, raw: true });

    const params = { limitAmount: -100 };

    const response = await helpers.editCustomBudget({
      id: budget.id,
      params,
      raw: false,
    });

    expect(response.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('fails validation when date format is invalid', async () => {
    const budget = await helpers.createCustomBudget({ ...baseBudgetMockData, raw: true });

    const params = { startDate: 'not-a-date' };

    const response = await helpers.editCustomBudget({
      id: budget.id,
      params,
      raw: false,
    });

    expect(response.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('successfully updates dates to valid ISO strings', async () => {
    const budget = await helpers.createCustomBudget({ ...baseBudgetMockData, raw: true });

    const newStartDate = new Date().toISOString();
    const newEndDate = addDays(new Date(), 30).toISOString();

    const params = {
      startDate: newStartDate,
      endDate: newEndDate,
    };

    const editedBudget = await helpers.editCustomBudget({
      id: budget.id,
      raw: true,
      params,
    });

    expect(editedBudget.startDate).toBe(newStartDate);
    expect(editedBudget.endDate).toBe(newEndDate);
  });

  it('fails validation when start date greater than end date', async () => {
    const budget = await helpers.createCustomBudget({ ...baseBudgetMockData, raw: true });

    const newStartDate = addDays(new Date(), 30).toISOString();
    const newEndDate = new Date().toISOString();

    const params = {
      startDate: newStartDate,
      endDate: newEndDate,
    };

    const response = await helpers.editCustomBudget({
      id: budget.id,
      params,
      raw: false,
    });

    expect(response.statusCode).toEqual(ERROR_CODES.ValidationError);
  });
});
