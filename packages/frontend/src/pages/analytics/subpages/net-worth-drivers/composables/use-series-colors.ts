import { computed } from 'vue';

import { NET_WORTH_ASSET_KIND_COLORS } from '../../net-worth-history/composables/net-worth-history-derivations';

/**
 * The colour of each driver series.
 *
 * Both reuse the Net Worth History asset-kind palette so a colour keeps one
 * meaning across the analytics pages: saved is money that came out of cash,
 * grown is what the investments returned. They are deliberately not the
 * income/expense green-and-red — the series are two sources of the same thing,
 * not a good/bad pair, and a losing period is already signed by the curve
 * dipping.
 *
 * The chart's curves and the legend's swatches both read from here, so a swatch
 * cannot label a curve in a colour the curve isn't drawn in.
 */
export const useSeriesColors = () =>
  computed(() => ({
    saved: NET_WORTH_ASSET_KIND_COLORS.cash,
    grown: NET_WORTH_ASSET_KIND_COLORS.investments,
  }));
