import { type ComputedRef, computed } from 'vue';

export interface SpikePoint {
  date: number;
  value: number;
  deltaAbsolute: number;
  deltaPercent: number;
  isPositive: boolean;
}

const SPIKE_PERCENT_THRESHOLD = 3;
const SPIKE_ABSOLUTE_THRESHOLD = 500;
const MAX_SPIKES = 10;

export function useSpikeDetection({ chartData }: { chartData: ComputedRef<{ date: number; value: number }[]> }): {
  spikePoints: ComputedRef<SpikePoint[]>;
} {
  const spikePoints = computed<SpikePoint[]>(() => {
    const data = chartData.value;
    if (data.length < 2) return [];

    const candidates: SpikePoint[] = [];

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1]!;
      const curr = data[i]!;

      const deltaAbsolute = curr.value - prev.value;

      // Avoid division by zero — if previous value is 0, use absolute value as percent proxy
      let deltaPercent = 0;
      if (prev.value !== 0) {
        deltaPercent = (deltaAbsolute / Math.abs(prev.value)) * 100;
      } else if (deltaAbsolute !== 0) {
        deltaPercent = 100;
      }

      if (Math.abs(deltaPercent) > SPIKE_PERCENT_THRESHOLD && Math.abs(deltaAbsolute) > SPIKE_ABSOLUTE_THRESHOLD) {
        candidates.push({
          date: curr.date,
          value: curr.value,
          deltaAbsolute,
          deltaPercent,
          isPositive: deltaAbsolute > 0,
        });
      }
    }

    // Sort by absolute percent change descending and cap at MAX_SPIKES
    return candidates.toSorted((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent)).slice(0, MAX_SPIKES);
  });

  return { spikePoints };
}
