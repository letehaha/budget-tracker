import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { nextTick, reactive, ref } from 'vue';

import { useChartTooltipPosition } from './use-chart-tooltip-position';

const makeRect = (rect: Partial<DOMRect>): DOMRect =>
  ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
    ...rect,
  }) as DOMRect;

// Container anchored at (100, 100) with a 300×300 plot.
const makeContainerRef = () =>
  ref({
    getBoundingClientRect: () => makeRect({ left: 100, top: 100, width: 300, height: 300, right: 400, bottom: 400 }),
  } as unknown as HTMLElement);

describe('useChartTooltipPosition', () => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;

  beforeEach(() => {
    window.innerWidth = 400;
    window.innerHeight = 800;
  });

  afterEach(() => {
    window.innerWidth = originalWidth;
    window.innerHeight = originalHeight;
  });

  it('defers positioning until layout when the tooltip is measured before it is shown', async () => {
    // The tooltip starts `display:none` (v-show), so its first measurement is
    // 0×0. Simulate that: the first getBoundingClientRect returns an empty
    // rect, later ones return the real size once it has been laid out.
    let rectCall = 0;
    const tooltipRef = ref({
      getBoundingClientRect: () => {
        rectCall += 1;
        return rectCall === 1 ? makeRect({}) : makeRect({ width: 288, height: 200 });
      },
    } as unknown as HTMLElement);

    const tooltip = reactive({ x: 0, y: 0 });
    const { updateTooltipPosition } = useChartTooltipPosition({
      containerRef: makeContainerRef(),
      tooltipRef,
      tooltip,
    });

    // Cursor near the right edge: with a 0-width measurement the edge-flip is
    // skipped and the tooltip would be shoved off-screen to the right.
    updateTooltipPosition({ clientX: 380, clientY: 150 });

    // First synchronous pass measured 0×0, so it deferred without positioning.
    expect(tooltip.x).toBe(0);
    expect(tooltip.y).toBe(0);

    await nextTick();

    // Re-measured with the real width and flipped to the left of the cursor so
    // the whole tooltip stays on-screen (left edge = 100 + (-18) = 82).
    expect(tooltip.x).toBe(-18);
    expect(tooltip.y).toBe(40);
  });

  it('positions synchronously to the right of the cursor when the tooltip already has size', () => {
    window.innerWidth = 1400;

    const tooltipRef = ref({
      getBoundingClientRect: () => makeRect({ width: 288, height: 200 }),
    } as unknown as HTMLElement);

    const tooltip = reactive({ x: 0, y: 0 });
    const { updateTooltipPosition } = useChartTooltipPosition({
      containerRef: makeContainerRef(),
      tooltipRef,
      tooltip,
    });

    updateTooltipPosition({ clientX: 150, clientY: 150 });

    // 150 - 100 + 10 = 60 (no overflow, sits to the right); 150 - 100 - 10 = 40.
    expect(tooltip.x).toBe(60);
    expect(tooltip.y).toBe(40);
  });
});
