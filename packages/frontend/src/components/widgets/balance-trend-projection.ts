import { TRANSACTION_TYPES } from '@bt/shared/types';
import { startOfDay } from 'date-fns';

export interface ProjectionPlanInput {
  /** The model types it as Date, the wire carries an ISO string; both parse the same way. */
  time: string | Date;
  /** Base-currency decimal, always positive; `transactionType` carries the direction. */
  refAmount: number;
  transactionType: TRANSACTION_TYPES;
  note?: string | null;
}

export interface ProjectionStep {
  /** Day timestamp the dashed line jumps on. */
  date: number;
  /** Cumulative projected value after this step. */
  value: number;
  /** One entry per plan folded into this step, for the dot's tooltip. */
  planLabels: { refDelta: number; note: string | null }[];
}

export interface BalanceProjection {
  /** Polyline for the dashed path: last real point, each step, and a period-end hold. */
  points: { date: number; value: number }[];
  steps: ProjectionStep[];
  projectedValue: number;
  planCount: number;
  /** Original (unclamped) time of the furthest plan in scope, for the "through {date}" label. */
  latestPlanTime: string | null;
}

/**
 * Builds the dashed continuation of the balance line out of pending plans.
 *
 * A plan dated in the past is still pending money, so it steps at `now` rather than
 * bending the line back in time; one dated past the period end belongs to a later
 * chart and is dropped from the value and the count alike. The last point holds the
 * final level to `periodEnd`, so the projection reads as "where the period lands",
 * not just "where the last plan sits".
 */
export const buildBalanceProjection = ({
  lastRealPoint,
  plans,
  periodEnd,
  now,
}: {
  lastRealPoint: { date: number; value: number } | null;
  plans: ProjectionPlanInput[];
  periodEnd: number;
  now: number;
}): BalanceProjection | null => {
  if (!lastRealPoint || plans.length === 0) return null;

  const today = startOfDay(now).getTime();
  const endDay = startOfDay(periodEnd).getTime();
  if (endDay < today) return null;

  const floorDate = Math.max(today, lastRealPoint.date);

  const inScope = plans
    .map((plan) => {
      const planDate = new Date(plan.time);
      if (Number.isNaN(planDate.getTime()) || !Number.isFinite(plan.refAmount)) return null;

      const planDay = startOfDay(planDate).getTime();
      if (planDay > endDay) return null;

      return {
        stepDate: Math.min(endDay, Math.max(planDay, floorDate)),
        planDate,
        refDelta: plan.transactionType === TRANSACTION_TYPES.expense ? -plan.refAmount : plan.refAmount,
        note: plan.note ?? null,
      };
    })
    .filter((plan) => plan !== null)
    .sort((a, b) => a.stepDate - b.stepDate);

  if (inScope.length === 0) return null;

  const steps: ProjectionStep[] = [];
  let runningValue = lastRealPoint.value;
  for (const plan of inScope) {
    runningValue += plan.refDelta;
    const lastStep = steps[steps.length - 1];
    if (lastStep && lastStep.date === plan.stepDate) {
      lastStep.value = runningValue;
      lastStep.planLabels.push({ refDelta: plan.refDelta, note: plan.note });
    } else {
      steps.push({
        date: plan.stepDate,
        value: runningValue,
        planLabels: [{ refDelta: plan.refDelta, note: plan.note }],
      });
    }
  }

  const points = [
    { date: lastRealPoint.date, value: lastRealPoint.value },
    ...steps.map(({ date, value }) => ({ date, value })),
  ];
  const lastStep = steps[steps.length - 1]!;
  if (lastStep.date < endDay) {
    points.push({ date: endDay, value: lastStep.value });
  }

  const latestPlanTime = inScope.reduce<Date | null>(
    (latest, plan) => (latest === null || plan.planDate > latest ? plan.planDate : latest),
    null,
  );

  return {
    points,
    steps,
    projectedValue: lastStep.value,
    planCount: inScope.length,
    latestPlanTime: latestPlanTime?.toISOString() ?? null,
  };
};
