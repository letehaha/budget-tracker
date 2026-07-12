export interface BudgetEditFormValues {
  name: string;
  limitAmount: number | null | undefined;
  categoryIds: string[];
}

export interface BudgetEditPayload {
  name: string;
  categoryIds: string[];
  limitAmount?: number;
}

/**
 * Builds the payload sent to the edit-budget endpoint from the form values.
 *
 * `limitAmount` is only included when it's a finite number greater than zero.
 * The endpoint validates `limitAmount` as a positive number and treats an
 * absent key as "leave the limit unchanged", so a budget with no limit must
 * omit the field entirely rather than send `0` (which fails validation).
 */
export const buildBudgetEditPayload = ({ name, limitAmount, categoryIds }: BudgetEditFormValues): BudgetEditPayload => {
  const payload: BudgetEditPayload = { name, categoryIds };

  if (typeof limitAmount === 'number' && Number.isFinite(limitAmount) && limitAmount > 0) {
    payload.limitAmount = limitAmount;
  }

  return payload;
};
