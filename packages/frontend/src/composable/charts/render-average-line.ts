import * as d3 from 'd3';

// Amber dashed average-line colour, shared by every chart that draws a mean
// reference line — the D3 stroke, the on-chart label, and any legend swatch all
// read from here so they can't drift apart. Not a Tailwind palette token: no
// shared categorical chart palette exists yet.
export const AVERAGE_LINE_COLOR = 'rgb(234, 179, 8)';

// Dark under-stroke behind the amber line keeps it legible over any bar colour.
const SHADOW_STROKE_COLOR = 'rgba(0, 0, 0, 0.5)';
const SHADOW_STROKE_WIDTH = 5;
const LINE_STROKE_WIDTH = 2.5;
const DASH_PATTERN = '8,4';
const LABEL_FONT_SIZE = 11;
// Hover target around the thin visible line, wide enough to hit without pixel-hunting.
const HIT_BAND_WIDTH = 14;

type ChartGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/**
 * Draws a horizontal dashed "average" reference line into an already-translated
 * chart group: a dark shadow stroke, the amber dashed line on top, and a
 * right-aligned amber value label over an opaque background so it reads across
 * bars. The caller controls draw order (call before bars to sit behind them, or
 * after to sit on top) and passes the label text pre-formatted (i18n + currency
 * formatting stay in the component).
 *
 * When hover handlers are supplied the label becomes a hover target; passing
 * `hitBand` additionally lays a wide invisible band over the whole line so the
 * line itself is hoverable, not just the label.
 */
export const renderAverageLine = ({
  g,
  innerWidth,
  y,
  label,
  labelBackground,
  onEnter,
  onMove,
  onLeave,
  hitBand = false,
}: {
  // Inner chart group, already translated past the margins.
  g: ChartGroup;
  innerWidth: number;
  // Pixel y of the line — the caller applies its own y-scale to the average value.
  y: number;
  // Pre-formatted "Average: $X" text.
  label: string;
  // Fill behind the label so it stays readable over bars; the caller's card colour.
  labelBackground: string;
  onEnter?: (event: MouseEvent) => void;
  onMove?: (event: MouseEvent) => void;
  onLeave?: () => void;
  // Lay a wide transparent band over the line so the whole line is a hover
  // target. Only meaningful alongside hover handlers.
  hitBand?: boolean;
}): void => {
  // Both visible strokes ignore the pointer so bars underneath stay hoverable.
  g.append('line')
    .attr('class', 'average-line-shadow')
    .attr('x1', 0)
    .attr('x2', innerWidth)
    .attr('y1', y)
    .attr('y2', y)
    .attr('stroke', SHADOW_STROKE_COLOR)
    .attr('stroke-width', SHADOW_STROKE_WIDTH)
    .attr('stroke-dasharray', DASH_PATTERN)
    .style('pointer-events', 'none');

  g.append('line')
    .attr('class', 'average-line')
    .attr('x1', 0)
    .attr('x2', innerWidth)
    .attr('y1', y)
    .attr('y2', y)
    .attr('stroke', AVERAGE_LINE_COLOR)
    .attr('stroke-width', LINE_STROKE_WIDTH)
    .attr('stroke-dasharray', DASH_PATTERN)
    .style('pointer-events', 'none');

  // Measure the label first so its background can be sized to the text.
  const tempText = g.append('text').attr('font-size', `${LABEL_FONT_SIZE}px`).attr('font-weight', '500').text(label);
  const textBBox = (tempText.node() as SVGTextElement).getBBox();
  tempText.remove();

  const labelGroup = g.append('g').attr('class', 'average-label-group');

  labelGroup
    .append('rect')
    .attr('class', 'average-label-bg')
    .attr('x', innerWidth - textBBox.width - 12)
    .attr('y', y - textBBox.height - 4)
    .attr('width', textBBox.width + 8)
    .attr('height', textBBox.height + 4)
    .attr('fill', labelBackground)
    .attr('rx', 3);

  labelGroup
    .append('text')
    .attr('class', 'average-label')
    .attr('x', innerWidth - 8)
    .attr('y', y - 6)
    .attr('text-anchor', 'end')
    .attr('font-size', `${LABEL_FONT_SIZE}px`)
    .attr('font-weight', '500')
    .attr('fill', AVERAGE_LINE_COLOR)
    .text(label);

  if (onEnter && onMove && onLeave) {
    labelGroup.style('cursor', 'pointer').on('mouseenter', onEnter).on('mousemove', onMove).on('mouseleave', onLeave);

    if (hitBand) {
      g.append('line')
        .attr('class', 'average-hit')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', 'transparent')
        .attr('stroke-width', HIT_BAND_WIDTH)
        .on('mouseenter', onEnter)
        .on('mousemove', onMove)
        .on('mouseleave', onLeave);
    }
  }
};
