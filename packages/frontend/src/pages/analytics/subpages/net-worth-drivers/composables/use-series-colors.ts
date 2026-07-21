import { currentTheme } from '@/common/utils/color-theme';
import { getChartColors } from '@/composable/charts/chart-colors';
import { computed } from 'vue';

/**
 * The colour of each driver series, resolved against the live theme.
 *
 * Savings and market growth are two sources of the same thing, not a good/bad
 * pair, so they take neutral series colours rather than the income/expense green
 * and red — a losing period is already signed by the curve dipping.
 *
 * The chart's curves and the legend's swatches both read from here, so a swatch
 * cannot label a curve in a colour the curve isn't drawn in.
 */
export const useSeriesColors = () =>
  computed(() => {
    // Depend on the theme explicitly: `grown` resolves a CSS custom property whose
    // value differs per theme, and `getChartColors` reads it once at call time.
    void currentTheme.value;

    return {
      // No global.css custom property carries a neutral chart blue, so this is the
      // one place the literal is allowed to live.
      saved: 'rgb(59, 130, 246)',
      grown: getChartColors().primary,
    };
  });
