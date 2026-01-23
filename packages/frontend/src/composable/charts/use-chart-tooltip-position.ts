import type { Ref } from 'vue';

interface TooltipPosition {
  x: number;
  y: number;
}

/**
 * Composable that provides tooltip positioning logic for chart components.
 * Ensures tooltips stay within viewport boundaries by flipping position
 * when they would overflow screen edges.
 */
export function useChartTooltipPosition({
  containerRef,
  tooltipRef,
  tooltip,
}: {
  containerRef: Ref<HTMLElement | null>;
  tooltipRef: Ref<HTMLElement | null>;
  tooltip: TooltipPosition;
}) {
  function updateTooltipPosition(event: MouseEvent) {
    if (!containerRef.value || !tooltipRef.value) return;

    const containerRect = containerRef.value.getBoundingClientRect();
    const tooltipRect = tooltipRef.value.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = event.clientX - containerRect.left + 10;
    let y = event.clientY - containerRect.top - 10;

    // Check if tooltip would overflow the viewport on the right
    const tooltipRightEdge = containerRect.left + x + tooltipRect.width;
    if (tooltipRightEdge > viewportWidth) {
      x = event.clientX - containerRect.left - tooltipRect.width - 10;
    }

    // Ensure tooltip doesn't go off the left edge
    const tooltipLeftEdge = containerRect.left + x;
    if (tooltipLeftEdge < 0) {
      x = -containerRect.left + 10;
    }

    // Check if tooltip would overflow the viewport on the bottom
    const tooltipBottomEdge = containerRect.top + y + tooltipRect.height;
    if (tooltipBottomEdge > viewportHeight) {
      y = event.clientY - containerRect.top - tooltipRect.height - 10;
    }

    // Ensure tooltip doesn't go off the top edge
    if (y < 0) {
      y = 10;
    }

    tooltip.x = x;
    tooltip.y = y;
  }

  return { updateTooltipPosition };
}
