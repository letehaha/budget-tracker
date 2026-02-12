import { api } from '@/api/_api';

export interface DashboardWidgetConfig {
  widgetId: string;
  colSpan: number;
  rowSpan?: number;
  config?: Record<string, unknown>;
}

export interface UserSettingsSchema {
  stats: {
    expenses: {
      excludedCategories: number[];
    };
  };
  dashboard?: {
    widgets: DashboardWidgetConfig[];
  };
}

export const getUserSettings = async (): Promise<UserSettingsSchema> => {
  const result = await api.get('/user/settings');

  return result;
};

export const updateUserSettings = async (settings: UserSettingsSchema): Promise<UserSettingsSchema> => {
  const result = await api.put('/user/settings', settings);

  return result;
};
