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

export type TransactionsView = 'list' | 'table';

interface TransactionsTableSettings {
  /** Ordered list of column ids the user wants visible. */
  visibleColumns: string[];
  /** Full column order (visible + hidden) used by the column-config UI. */
  columnOrder: string[];
  /** Preferred transactions view on narrow screens: compact list or the full table. */
  mobileView?: TransactionsView;
  /** Preferred transactions view on wide screens: compact list or the full table. */
  desktopView?: TransactionsView;
  /**
   * Optional filters the user added to the transactions filter bar (besides the
   * always-visible ones). Unknown ids are dropped client-side on read.
   */
  extraFilters?: string[];
}

interface TransactionsListSettings {
  /**
   * When true, the pinned "Upcoming" section (overdue + due within 3 days) is
   * hidden from the list view. Defaults to false (section visible).
   */
  hideUpcoming?: boolean;
}

interface InvestmentTransactionsTableSettings {
  /** Ordered list of column ids the user wants visible. */
  visibleColumns: string[];
  /** Full column order (visible + hidden) used by the column-config UI. */
  columnOrder: string[];
}

export interface UiSettings {
  transactionsTable?: TransactionsTableSettings;
  transactionsList?: TransactionsListSettings;
  investmentTransactionsTable?: InvestmentTransactionsTableSettings;
}

export interface SubscriptionsSettings {
  /** Seeds the auto-record toggle on the create-subscription form; the form
   *  still lets the user override it per subscription. */
  defaultAutoRecord?: boolean;
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
  subscriptions?: SubscriptionsSettings;
}

export const getUserSettings = async (): Promise<UserSettingsSchema> => {
  const result = await api.get('/user/settings');

  return result;
};

export const updateUserSettings = async (settings: UserSettingsSchema): Promise<UserSettingsSchema> => {
  const result = await api.put('/user/settings', settings);

  return result;
};

/** Arrays stay non-partial: the backend merge replaces them wholesale, so a
 * patched array must always be the full desired list. `NonNullable` keeps the
 * recursion working for optional properties – their `undefined` part would
 * otherwise fail the `extends object` check and leave the field required-deep. */
type DeepPartial<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends (infer U)[]
    ? U[]
    : NonNullable<T[K]> extends object
      ? DeepPartial<NonNullable<T[K]>>
      : T[K];
};

type UserSettingsPatch = DeepPartial<UserSettingsSchema>;

/**
 * Partial settings update: only the keys present in `patch` change, the server
 * deep-merges the rest from its stored value and returns the merged settings.
 * Use this instead of `updateUserSettings` for slice updates — sending the
 * whole object built from a possibly-stale cache loses concurrent writes from
 * other tabs or in-flight mutations.
 */
export const patchUserSettings = async (patch: UserSettingsPatch): Promise<UserSettingsSchema> => {
  const result = await api.patch('/user/settings', patch);

  return result;
};
