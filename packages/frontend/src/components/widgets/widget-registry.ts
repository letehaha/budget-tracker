import type { Component } from 'vue';

export interface WidgetSize {
  colSpan: number;
  rowSpan: number;
  label: string;
}

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  defaultColSpan: number;
  defaultRowSpan: number;
  allowedSizes: WidgetSize[];
  component: () => Promise<{ default: Component }>;
  needsPeriod: boolean;
}

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  'balance-trend': {
    id: 'balance-trend',
    name: 'dashboard.widgets.registry.balanceTrend.name',
    description: 'dashboard.widgets.registry.balanceTrend.description',
    defaultColSpan: 2,
    defaultRowSpan: 1,
    allowedSizes: [
      { colSpan: 1, rowSpan: 1, label: '1×1' },
      { colSpan: 2, rowSpan: 1, label: '2×1' },
      { colSpan: 3, rowSpan: 1, label: '3×1' },
    ],
    component: () => import('@/components/widgets/balance-trend.vue'),
    needsPeriod: true,
  },
  'spending-categories': {
    id: 'spending-categories',
    name: 'dashboard.widgets.registry.spendingCategories.name',
    description: 'dashboard.widgets.registry.spendingCategories.description',
    defaultColSpan: 2,
    defaultRowSpan: 1,
    allowedSizes: [
      { colSpan: 1, rowSpan: 1, label: '1×1' },
      { colSpan: 2, rowSpan: 1, label: '2×1' },
    ],
    component: () => import('@/components/widgets/expenses-structure.vue'),
    needsPeriod: true,
  },
  'latest-records': {
    id: 'latest-records',
    name: 'dashboard.widgets.registry.latestRecords.name',
    description: 'dashboard.widgets.registry.latestRecords.description',
    defaultColSpan: 1,
    defaultRowSpan: 1,
    allowedSizes: [
      { colSpan: 1, rowSpan: 1, label: '1×1' },
      { colSpan: 1, rowSpan: 2, label: '1×2' },
    ],
    component: () => import('@/components/widgets/latest-records.vue'),
    needsPeriod: false,
  },
  'subscriptions-overview': {
    id: 'subscriptions-overview',
    name: 'dashboard.widgets.registry.subscriptions.name',
    description: 'dashboard.widgets.registry.subscriptions.description',
    defaultColSpan: 1,
    defaultRowSpan: 1,
    allowedSizes: [
      { colSpan: 1, rowSpan: 1, label: '1×1' },
      { colSpan: 2, rowSpan: 1, label: '2×1' },
    ],
    component: () => import('@/components/widgets/subscriptions-overview.vue'),
    needsPeriod: false,
  },
};

export const DEFAULT_DASHBOARD_LAYOUT = [
  { widgetId: 'balance-trend', colSpan: 2 },
  { widgetId: 'latest-records', colSpan: 1 },
  { widgetId: 'spending-categories', colSpan: 2 },
];
