import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';

import { useProjectionCalc, type ProjectionParams } from '../use-projection-calc';

const createParams = (overrides: Partial<ProjectionParams> = {}) => {
  const defaults: ProjectionParams = {
    initialBalance: 10000,
    monthlyContribution: 500,
    timeHorizonYears: 10,
    annualReturnRate: 10,
    annualInflationRate: 3,
    ...overrides,
  };
  return computed(() => defaults);
};

describe('useProjectionCalc', () => {
  it('generates correct number of data points', () => {
    const params = createParams({ timeHorizonYears: 5 });
    const { dataPoints } = useProjectionCalc({ params });

    // 5 years * 12 months + 1 (starting point)
    expect(dataPoints.value).toHaveLength(61);
  });

  it('first data point is the initial balance', () => {
    const params = createParams({ initialBalance: 25000 });
    const { dataPoints } = useProjectionCalc({ params });

    expect(dataPoints.value[0]).toEqual({
      month: 0,
      year: 0,
      nominal: 25000,
      real: 25000,
      totalInvested: 25000,
    });
  });

  it('total invested is initial + monthly * months', () => {
    const params = createParams({
      initialBalance: 10000,
      monthlyContribution: 500,
      timeHorizonYears: 10,
    });
    const { dataPoints } = useProjectionCalc({ params });

    const last = dataPoints.value[dataPoints.value.length - 1]!;
    expect(last.totalInvested).toBe(10000 + 500 * 120);
  });

  it('nominal value exceeds total invested with positive return', () => {
    const params = createParams({
      annualReturnRate: 10,
    });
    const { dataPoints } = useProjectionCalc({ params });

    const last = dataPoints.value[dataPoints.value.length - 1]!;
    expect(last.nominal).toBeGreaterThan(last.totalInvested);
  });

  it('real value is less than nominal when inflation is positive', () => {
    const params = createParams({
      annualReturnRate: 10,
      annualInflationRate: 3,
    });
    const { dataPoints } = useProjectionCalc({ params });

    const last = dataPoints.value[dataPoints.value.length - 1]!;
    expect(last.real).toBeLessThan(last.nominal);
    expect(last.real).toBeGreaterThan(0);
  });

  it('real equals nominal when inflation is 0', () => {
    const params = createParams({
      annualReturnRate: 10,
      annualInflationRate: 0,
    });
    const { dataPoints } = useProjectionCalc({ params });

    const last = dataPoints.value[dataPoints.value.length - 1]!;
    expect(last.real).toBeCloseTo(last.nominal, 2);
  });

  it('with 0% return, nominal equals total invested', () => {
    const params = createParams({
      annualReturnRate: 0,
      annualInflationRate: 0,
    });
    const { dataPoints } = useProjectionCalc({ params });

    const last = dataPoints.value[dataPoints.value.length - 1]!;
    expect(last.nominal).toBeCloseTo(last.totalInvested, 2);
  });

  it('handles zero initial balance and zero contribution', () => {
    const params = createParams({
      initialBalance: 0,
      monthlyContribution: 0,
    });
    const { dataPoints, summary } = useProjectionCalc({ params });

    const last = dataPoints.value[dataPoints.value.length - 1]!;
    expect(last.nominal).toBe(0);
    expect(last.real).toBe(0);
    expect(last.totalInvested).toBe(0);
    expect(summary.value.realMultiplier).toBe(0);
  });

  describe('summary', () => {
    it('calculates correct growth amounts', () => {
      const params = createParams({
        initialBalance: 10000,
        monthlyContribution: 500,
        timeHorizonYears: 10,
        annualReturnRate: 10,
        annualInflationRate: 3,
      });
      const { summary } = useProjectionCalc({ params });

      expect(summary.value.totalInvested).toBe(70000);
      expect(summary.value.nominalGrowth).toBeCloseTo(summary.value.nominalFinalValue - 70000, 2);
      expect(summary.value.realGrowth).toBeCloseTo(summary.value.realFinalValue - 70000, 2);
      expect(summary.value.realMultiplier).toBeCloseTo(summary.value.realFinalValue / 70000, 4);
    });

    it('monthly contribution is passed through', () => {
      const params = createParams({ monthlyContribution: 1234 });
      const { summary } = useProjectionCalc({ params });

      expect(summary.value.monthlyContribution).toBe(1234);
    });
  });

  it('handles timeHorizonYears of 0', () => {
    const params = createParams({ timeHorizonYears: 0 });
    const { dataPoints, summary } = useProjectionCalc({ params });

    // Only the starting point
    expect(dataPoints.value).toHaveLength(1);
    expect(summary.value.nominalGrowth).toBe(0);
    expect(summary.value.realGrowth).toBe(0);
    expect(summary.value.realMultiplier).toBe(1); // initialBalance > 0
  });

  it('handles negative annual return rate', () => {
    const params = createParams({
      annualReturnRate: -5,
      annualInflationRate: 0,
    });
    const { dataPoints } = useProjectionCalc({ params });

    const last = dataPoints.value[dataPoints.value.length - 1]!;
    expect(last.nominal).toBeLessThan(last.totalInvested);
  });

  it('handles fractional timeHorizonYears', () => {
    const params = createParams({ timeHorizonYears: 0.5 });
    const { dataPoints } = useProjectionCalc({ params });

    // 0.5 years = 6 months + 1 starting point
    expect(dataPoints.value).toHaveLength(7);
  });

  it('is reactive to param changes', () => {
    const paramsRef = ref<ProjectionParams>({
      initialBalance: 10000,
      monthlyContribution: 500,
      timeHorizonYears: 5,
      annualReturnRate: 10,
      annualInflationRate: 3,
    });

    const { summary } = useProjectionCalc({ params: paramsRef });
    const initialNominal = summary.value.nominalFinalValue;

    paramsRef.value = { ...paramsRef.value, timeHorizonYears: 10 };
    expect(summary.value.nominalFinalValue).toBeGreaterThan(initialNominal);
  });
});
