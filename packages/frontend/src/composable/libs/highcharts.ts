import { useFormatCurrency } from '@/composable';
import { format } from 'date-fns';
import * as Highcharts from 'highcharts';
import { cloneDeep, merge } from 'lodash-es';

const defaultConfig: Highcharts.Options = {
  chart: {
    backgroundColor: 'transparent',
  },
  credits: {
    enabled: false,
  },
  title: {
    text: undefined,
  },
  accessibility: {
    // To remove warning about need to add accesibility.js
    enabled: false,
  },
};

export const useHighcharts = () => {
  const { formatBaseCurrency } = useFormatCurrency();

  const getDefaultConfig = () => cloneDeep(defaultConfig);

  const buildAreaChartConfig = (extendConfig: Highcharts.Options): Highcharts.Options =>
    merge(
      getDefaultConfig(),
      {
        chart: { type: 'area' },
        // So xAxis will be rendered correctly but not as hours
        time: {
          useUTC: false,
        },
        xAxis: {
          type: 'datetime',
          dateTimeLabelFormats: {
            day: '%e %b',
          },
          // Show fullheight crosshair for the selected point
          // crosshair: true
          gridLineWidth: 0,
          labels: {
            style: {
              color: 'var(--app-text-base)',
            },
          },
        },
        yAxis: {
          title: null,
          labels: {
            style: {
              color: 'var(--app-text-base)',
            },
          },
          gridLineColor: 'rgba(var(--app-primary-rgb), 0.1)',
        },
        plotOptions: {
          area: {
            fillOpacity: 0.5,
            lineColor: 'var(--app-primary)',
            lineWidth: 2,
            states: {
              hover: {
                lineWidth: 3,
              },
            },
            threshold: null,
            fillColor: {
              linearGradient: {
                x1: 0,
                x2: 0,
                y1: 0,
                y2: 1,
              },
              stops: [
                [0, 'rgba(var(--app-primary-rgb), 0.3)'],
                [1, 'rgba(var(--app-primary-rgb), 0)'],
              ],
            },
            marker: {
              // Disable markers so the line will be smoother
              enabled: false,
              states: {
                hover: {
                  enabled: true,
                  fillColor: 'var(--app-primary)',
                  lineColor: 'var(--app-primary)',
                  lineWidth: 0,
                },
              },
            },
          },
        },
        tooltip: {
          useHTML: true,
          backgroundColor: 'var(--app-bg-box)',
          borderColor: 'transparent',
          formatter() {
            return `
          <div class="balance-trend-widget-tooltip">
            <div class="balance-trend-widget-tooltip__date">
              ${format(Number(this.x), 'MMMM d, yyyy')}
            </div>
            <div class="balance-trend-widget-tooltip__value">
              Balance: <span>${formatBaseCurrency(this.y)}</span>
            </div>
          </div>
        `;
          },
          shadow: false,
          borderRadius: 8,
          style: {
            color: 'var(--app-text-base)',
          },
        },
      } as Highcharts.Options,
      extendConfig,
    );

  const buildDonutChartConfig = (
    extendConfig: Highcharts.Options,
    {
      centerFormatter,
    }: {
      centerFormatter?: (options: { renderer: Highcharts.SVGRenderer }) => Highcharts.SVGElement;
    } = {},
  ) =>
    merge(
      getDefaultConfig(),
      {
        chart: { type: 'pie', margin: 0 },
        tooltip: {
          enabled: false, // No tooltip
        },
        plotOptions: {
          pie: {
            innerSize: '70%',
            borderColor: null,
            // Default colors, but you can customize this array as you like
            colors: Highcharts.getOptions().colors,
            dataLabels: {
              enabled: false,
            },
            point: {
              events: {
                mouseOver(this: Highcharts.Point) {
                  const chart: Highcharts.Chart & {
                    hoverLabel?: Highcharts.SVGElement;
                  } = this.series.chart;
                  const pieSeries = this.series;
                  const center = pieSeries.center;

                  // Remove any existing label
                  if (chart.hoverLabel) {
                    chart.hoverLabel.destroy();
                  }

                  if (centerFormatter) {
                    chart.hoverLabel = centerFormatter({
                      renderer: chart.renderer,
                    });
                  } else {
                    // Create the custom text element in the center of the chart
                    chart.hoverLabel = chart.renderer
                      .text(
                        `
                    <div class="spending-categories-widget-tooltip">
                      <div class="spending-categories-widget-tooltip__name">
                        ${this.name}
                      </div>
                      <div class="spending-categories-widget-tooltip__value">
                        ${formatBaseCurrency(this.y)}
                      </div>
                    </div>
                  `,
                        // below "x" and "y" will be overriden
                        0,
                        0,
                        true,
                      )
                      .add();
                  }

                  // Adjust the position based on the bounding box of the text
                  const bbox = chart.hoverLabel.getBBox();
                  chart.hoverLabel.attr({
                    x: +center[0] - bbox.width / 2,
                    // this is an offset to adjust vertical centering
                    y: +center[1] + bbox.height / 4,
                  });
                },
                mouseOut() {
                  const chart: Highcharts.Chart & {
                    hoverLabel?: Highcharts.SVGElement;
                  } = this.series.chart;

                  if (chart.hoverLabel) {
                    chart.hoverLabel.destroy();
                    delete chart.hoverLabel;
                  }
                },
              },
            },
          },
        },
      } as Highcharts.Options,
      extendConfig,
    );

  return {
    getDefaultConfig,
    buildAreaChartConfig,
    buildDonutChartConfig,
  };
};
