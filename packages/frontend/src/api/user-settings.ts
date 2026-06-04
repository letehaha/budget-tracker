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

export interface UserSettingsSchema {
  locale?: SupportedLocale;
  dashboard?: {
    widgets: DashboardWidgetConfig[];
  };
  includeCreditLimitInStats?: boolean;
  sidebarSections?: SidebarSectionsConfig;
  payeeExtractionUsesDescription?: boolean;
}

export const getUserSettings = async (): Promise<UserSettingsSchema> => {
  const result = await api.get('/user/settings');

  return result;
};

export const updateUserSettings = async (settings: UserSettingsSchema): Promise<UserSettingsSchema> => {
  const result = await api.put('/user/settings', settings);

  return result;
};
