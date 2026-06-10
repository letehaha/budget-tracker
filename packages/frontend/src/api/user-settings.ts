import { api } from '@/api/_api';
import type { SupportedLocale } from '@bt/shared/i18n/locales';

export interface DashboardWidgetConfig {
  widgetId: string;
  colSpan: number;
  rowSpan?: number;
  config?: Record<string, unknown>;
}

export interface SidebarSectionsConfig {
  portfolios: boolean;
  ventures: boolean;
  vehicles: boolean;
}

export type TransactionsMobileView = 'list' | 'table';

export interface TransactionsTableSettings {
  /** Ordered list of column ids the user wants visible. */
  visibleColumns: string[];
  /** Full column order (visible + hidden) used by the column-config UI. */
  columnOrder: string[];
  /** Preferred transactions view on narrow screens: compact list or the full table. */
  mobileView?: TransactionsMobileView;
  /**
   * Optional filters the user added to the transactions filter bar (besides the
   * always-visible ones). Unknown ids are dropped client-side on read.
   */
  extraFilters?: string[];
}

export interface UiSettings {
  transactionsTable?: TransactionsTableSettings;
}

export interface UserSettingsSchema {
  locale?: SupportedLocale;
  dashboard?: {
    widgets: DashboardWidgetConfig[];
  };
  includeCreditLimitInStats?: boolean;
  sidebarSections?: SidebarSectionsConfig;
  payeeExtractionUsesDescription?: boolean;
  ui?: UiSettings;
}

export const getUserSettings = async (): Promise<UserSettingsSchema> => {
  const result = await api.get('/user/settings');

  return result;
};

export const updateUserSettings = async (settings: UserSettingsSchema): Promise<UserSettingsSchema> => {
  const result = await api.put('/user/settings', settings);

  return result;
};
