import { useResizeObserver } from '@vueuse/core';
import { ref } from 'vue';

type SizeSource = 'borderBoxSize' | 'contentRect';

interface CssVarConfig {
  cssVarName: `--${string}`;
  /**
   * Which size measurement to use:
   * - 'borderBoxSize': Uses borderBoxSize[0].blockSize (includes padding/border)
   * - 'contentRect': Uses contentRect.height (content area only)
   *
   * Safari PWA mode and Safari default mode may require different sources
   * for correct positioning calculations.
   */
  sizeSource?: SizeSource;
}

/**
 * Composable that dynamically sets CSS variables based on an element's height.
 * Useful for elements like headers and navbars where other components need to
 * know the exact height for positioning.
 *
 * @param cssVars - Array of CSS variable configurations to set
 * @returns Object containing the element ref to bind to the template
 */
export const useCssVarFromElementSize = ({ cssVars }: { cssVars: CssVarConfig[] }) => {
  const elementRef = ref<HTMLElement | null>(null);

  useResizeObserver(elementRef, (entries) => {
    const entry = entries[0];
    if (entry) {
      cssVars.forEach(({ cssVarName, sizeSource = 'borderBoxSize' }) => {
        const height = sizeSource === 'borderBoxSize' ? entry.borderBoxSize[0].blockSize : entry.contentRect.height;

        document.documentElement.style.setProperty(cssVarName, `${height}px`);
      });
    }
  });

  return { elementRef };
};
