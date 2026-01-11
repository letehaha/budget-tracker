import type { Period } from '../subpages/cash-flow/components/period-selector.vue';

/**
 * Creates a serializer for Period objects to use with VueUse storage composables.
 * Handles Date object serialization/deserialization for sessionStorage/localStorage.
 */
export function createPeriodSerializer({ getDefaultPeriod }: { getDefaultPeriod: () => Period }) {
  return {
    read: (raw: string): Period => {
      try {
        const parsed = JSON.parse(raw);
        return {
          from: new Date(parsed.from),
          to: new Date(parsed.to),
        };
      } catch {
        return getDefaultPeriod();
      }
    },
    write: (value: Period): string =>
      JSON.stringify({
        from: value.from.toISOString(),
        to: value.to.toISOString(),
      }),
  };
}
