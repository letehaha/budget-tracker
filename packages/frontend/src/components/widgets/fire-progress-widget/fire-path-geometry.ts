import type { FireChart, FireChartPoint } from '@/composable/fire/build-fire-plan';
import { shapeFireChart } from '@/composable/fire/fire-display';
import { area, line, scaleLinear, scaleTime } from 'd3';

export const PLOT_TOP_PX = 18;
export const PLOT_BOTTOM_PX = 16;
const Y_HEADROOM = 1.08;
export const LABEL_EDGE_PX = 36;

export const labelAnchor = ({ x, width }: { x: number; width: number }) => {
  if (x < LABEL_EDGE_PX) return 'start';
  if (x > width - LABEL_EDGE_PX) return 'end';
  return 'middle';
};

export const buildFirePathGeometry = ({
  chart,
  width,
  height,
}: {
  chart: FireChart;
  width: number;
  height: number;
}) => {
  const { history, projection, dots, fireDot } = shapeFireChart({ chart });
  const today = projection[0];
  if (!today || width <= 0 || height <= PLOT_TOP_PX + PLOT_BOTTOM_PX) return null;

  const start = history[0]?.date ?? today.date;
  const end = projection[projection.length - 1]!.date;
  const values = [...history, ...projection].map((p) => p.value);
  const x = scaleTime().domain([start, end]).range([0, width]);
  const y = scaleLinear()
    .domain([Math.min(0, ...values), Math.max(chart.targetLine, ...values) * Y_HEADROOM])
    .range([height - PLOT_BOTTOM_PX, PLOT_TOP_PX]);

  const px = (p: FireChartPoint) => x(p.date);
  const py = (p: FireChartPoint) => y(p.value);
  const hasHistory = history.length > 1;

  return {
    historyArea: hasHistory ? area<FireChartPoint>().x(px).y0(y(0)).y1(py)(history) : null,
    historyLine: hasHistory ? line<FireChartPoint>().x(px).y(py)(history) : null,
    projectionLine: line<FireChartPoint>().x(px).y(py)(projection),
    targetY: y(chart.targetLine),
    todayX: x(today.date),
    fireDot: fireDot === null ? null : { x: px(fireDot), y: py(fireDot), date: fireDot.date },
    milestoneDots: dots.map(({ pct, month }) => ({ pct, x: px(projection[month]!), y: py(projection[month]!) })),
    startDate: start,
    endDate: end,
  };
};
