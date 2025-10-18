import { computed, type ComputedRef, type Ref } from 'vue';

export interface PreviewRow {
  price: number;
  date: string;
  currency: string;
}

export interface ExistingPrice {
  date: string; // YYYY-MM-DD
  price: number;
}

export interface EnrichedRow extends PreviewRow {
  existingPrice: number | null;
  percentageDiff: number | null;
  hasSignificantDiff: boolean;
}

interface UsePriceComparisonOptions {
  data: Ref<PreviewRow[]>;
  existingPrices: Ref<ExistingPrice[] | undefined>;
  showOnlyDifferences: Ref<boolean>;
  significantDiffThreshold?: number;
}

interface UsePriceComparisonReturn {
  existingPricesMap: ComputedRef<Map<string, number>>;
  enrichedData: ComputedRef<EnrichedRow[]>;
  filteredData: ComputedRef<EnrichedRow[]>;
  significantDifferencesCount: ComputedRef<number>;
  hasSignificantDifferences: ComputedRef<boolean>;
}

/**
 * Composable for comparing new prices with existing prices
 * Handles enrichment, filtering, and difference calculations
 */
export function usePriceComparison(options: UsePriceComparisonOptions): UsePriceComparisonReturn {
  const { data, existingPrices, showOnlyDifferences, significantDiffThreshold = 4 } = options;

  // Create a map of existing prices by date for quick lookup
  const existingPricesMap = computed(() => {
    if (!existingPrices.value) return new Map<string, number>();

    return new Map(existingPrices.value.map((p) => [p.date, p.price]));
  });

  // Enrich data with existing prices and difference calculations
  const enrichedData = computed<EnrichedRow[]>(() => {
    return data.value.map((row) => {
      const existingPrice = existingPricesMap.value.get(row.date) ?? null;

      let percentageDiff: number | null = null;
      let hasSignificantDiff = false;

      if (existingPrice !== null) {
        percentageDiff = ((row.price - existingPrice) / existingPrice) * 100;
        hasSignificantDiff = Math.abs(percentageDiff) > significantDiffThreshold;
      }

      return {
        ...row,
        existingPrice,
        percentageDiff,
        hasSignificantDiff,
      };
    });
  });

  // Filter data based on "show only differences" checkbox
  const filteredData = computed(() => {
    if (!showOnlyDifferences.value) return enrichedData.value;
    return enrichedData.value.filter((row) => row.hasSignificantDiff);
  });

  // Count rows with significant differences
  const significantDifferencesCount = computed(() => {
    return enrichedData.value.filter((row) => row.hasSignificantDiff).length;
  });

  const hasSignificantDifferences = computed(() => {
    return significantDifferencesCount.value > 0;
  });

  return {
    existingPricesMap,
    enrichedData,
    filteredData,
    significantDifferencesCount,
    hasSignificantDifferences,
  };
}
