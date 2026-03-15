import { type ComputedRef, computed } from 'vue';

export interface SpikePoint {
  date: number;
  value: number;
  deltaAbsolute: number;
  deltaPercent: number;
  isPositive: boolean;
}

export interface SpikeDetectionOptions {
  enabled?: boolean;
  percentThreshold?: number;
  absoluteThreshold?: number;
  maxSpikes?: number;
}

export const SPIKE_DEFAULTS = {
  enabled: true,
  percentThreshold: 3,
  absoluteThreshold: 500,
  maxSpikes: 10,
} as const;

export function useSpikeDetection({
  chartData,
  options,
}: {
  chartData: ComputedRef<{ date: number; value: number }[]>;
  options?: ComputedRef<SpikeDetectionOptions>;
}): {
  spikePoints: ComputedRef<SpikePoint[]>;
} {
  const spikePoints = computed<SpikePoint[]>(() => {
    const opts = options?.value ?? {};
    const enabled = opts.enabled ?? SPIKE_DEFAULTS.enabled;
    if (!enabled) return [];

    const percentThreshold = Math.max(1, opts.percentThreshold ?? SPIKE_DEFAULTS.percentThreshold);
    const absoluteThreshold = Math.max(1, opts.absoluteThreshold ?? SPIKE_DEFAULTS.absoluteThreshold);
    const maxSpikes = Math.max(1, opts.maxSpikes ?? SPIKE_DEFAULTS.maxSpikes);

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

      if (Math.abs(deltaPercent) > percentThreshold || Math.abs(deltaAbsolute) > absoluteThreshold) {
        candidates.push({
          date: curr.date,
          value: curr.value,
          deltaAbsolute,
          deltaPercent,
          isPositive: deltaAbsolute > 0,
        });
      }
    }

    // Sort by absolute percent change descending and cap at maxSpikes
    return candidates.toSorted((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent)).slice(0, maxSpikes);
  });

  return { spikePoints };
}
