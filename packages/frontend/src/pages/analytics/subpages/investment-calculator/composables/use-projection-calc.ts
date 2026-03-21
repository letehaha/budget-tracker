import { computed, type Ref } from 'vue';

export interface ProjectionParams {
  initialBalance: number;
  monthlyContribution: number;
  timeHorizonYears: number;
  annualReturnRate: number;
  annualInflationRate: number;
}

export interface ProjectionDataPoint {
  /** Month index (0 = start) */
  month: number;
  /** Year label (e.g., 1, 2, 3...) */
  year: number;
  nominal: number;
  real: number;
  totalInvested: number;
}

export interface ProjectionSummary {
  initialBalance: number;
  totalContributions: number;
  monthlyContribution: number;
  totalInvested: number;
  nominalFinalValue: number;
  nominalGrowth: number;
  realFinalValue: number;
  realGrowth: number;
  realMultiplier: number;
}

export function useProjectionCalc({ params }: { params: Ref<ProjectionParams> }) {
  const dataPoints = computed<ProjectionDataPoint[]>(() => {
    const { initialBalance, monthlyContribution, timeHorizonYears, annualReturnRate, annualInflationRate } =
      params.value;

    const totalMonths = Math.round(timeHorizonYears * 12);
    const monthlyNominalRate = Math.pow(1 + annualReturnRate / 100, 1 / 12) - 1;

    const points: ProjectionDataPoint[] = [];

    let nominal = initialBalance;

    // Add starting point
    points.push({
      month: 0,
      year: 0,
      nominal: initialBalance,
      real: initialBalance,
      totalInvested: initialBalance,
    });

    for (let m = 1; m <= totalMonths; m++) {
      nominal = nominal * (1 + monthlyNominalRate) + monthlyContribution;
      const totalInvested = initialBalance + monthlyContribution * m;
      const yearsElapsed = m / 12;
      const real = nominal / Math.pow(1 + annualInflationRate / 100, yearsElapsed);

      points.push({
        month: m,
        year: yearsElapsed,
        nominal,
        real,
        totalInvested,
      });
    }

    return points;
  });

  const summary = computed<ProjectionSummary>(() => {
    const points = dataPoints.value;
    const last = points[points.length - 1];

    if (!last || points.length <= 1) {
      return {
        initialBalance: params.value.initialBalance,
        totalContributions: 0,
        monthlyContribution: params.value.monthlyContribution,
        totalInvested: params.value.initialBalance,
        nominalFinalValue: params.value.initialBalance,
        nominalGrowth: 0,
        realFinalValue: params.value.initialBalance,
        realGrowth: 0,
        realMultiplier: params.value.initialBalance > 0 ? 1 : 0,
      };
    }

    return {
      initialBalance: params.value.initialBalance,
      totalContributions: last.totalInvested - params.value.initialBalance,
      monthlyContribution: params.value.monthlyContribution,
      totalInvested: last.totalInvested,
      nominalFinalValue: last.nominal,
      nominalGrowth: last.nominal - last.totalInvested,
      realFinalValue: last.real,
      realGrowth: last.real - last.totalInvested,
      realMultiplier: last.totalInvested > 0 ? last.real / last.totalInvested : 0,
    };
  });

  return { dataPoints, summary };
}
