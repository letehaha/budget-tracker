import type { Ref } from 'vue';

interface TooltipPosition {
  x: number;
  y: number;
}

/**
 * Composable that provides tooltip positioning logic for chart components.
 * Ensures tooltips stay within viewport boundaries by flipping position
 * when they would overflow screen edges.
 *
 * @param strategy - 'absolute' positions relative to containerRef (default),
 *   'fixed' positions relative to the viewport (use when container has overflow clipping).
 */
export function useChartTooltipPosition({
  containerRef,
  tooltipRef,
  tooltip,
  strategy = 'absolute',
}: {
  containerRef: Ref<HTMLElement | null>;
  tooltipRef: Ref<HTMLElement | null>;
  tooltip: TooltipPosition;
  strategy?: 'absolute' | 'fixed';
}) {
  function updateTooltipPosition(event: MouseEvent) {
    if (!containerRef.value || !tooltipRef.value) return;

    const tooltipRect = tooltipRef.value.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const containerRect = containerRef.value.getBoundingClientRect();
    const originX = strategy === 'fixed' ? 0 : containerRect.left;
    const originY = strategy === 'fixed' ? 0 : containerRect.top;

    let x = event.clientX - originX + 10;
    let y = event.clientY - originY - 10;

    if (originX + x + tooltipRect.width > viewportWidth) {
      x = event.clientX - originX - tooltipRect.width - 10;
    }
    if (originX + x < 0) {
      x = -originX + 10;
    }

    if (originY + y + tooltipRect.height > viewportHeight) {
      y = event.clientY - originY - tooltipRect.height - 10;
    }
    if (y < 0) {
      y = 10;
    }

    tooltip.x = x;
    tooltip.y = y;
  }

  return { updateTooltipPosition };
}
