import type { DashboardWidgetConfig } from '@/api/user-settings';
import { useNotificationCenter } from '@/components/notification-center';
import { captureException } from '@/lib/sentry';
import { type Ref, computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { type NetWorthIncludeSettings, readNetWorthSettings } from './helpers';

const SENTRY_SCOPE = 'net-worth-widget:persist-settings';

/**
 * Reads and persists the net-worth widget's include toggles through the shared
 * widget-config injection.
 */
export const useNetWorthConfig = () => {
  const { t } = useI18n();
  const { addErrorNotification } = useNotificationCenter();

  const widgetConfigRef = inject<Ref<DashboardWidgetConfig> | null>('dashboard-widget-config', null);
  const saveWidgetConfig =
    inject<(params: { widgetId: string; config: Record<string, unknown> }) => Promise<void>>(
      'dashboard-save-widget-config',
    );

  const isUpdating = ref(false);

  const settings = computed<NetWorthIncludeSettings>(() =>
    readNetWorthSettings({ widgetConfig: widgetConfigRef?.value }),
  );

  const persistSettings = async ({ patch }: { patch: Partial<NetWorthIncludeSettings> }) => {
    if (!saveWidgetConfig || !widgetConfigRef?.value) {
      captureException({
        error: new Error('Net-worth widget rendered without the dashboard widget-config injection'),
        context: { scope: SENTRY_SCOPE },
      });
      return;
    }

    isUpdating.value = true;

    try {
      await saveWidgetConfig({ widgetId: widgetConfigRef.value.widgetId, config: patch });
    } catch (error) {
      captureException({ error, context: { scope: SENTRY_SCOPE } });
      addErrorNotification(t('errors.api.unexpectedError'));
    } finally {
      isUpdating.value = false;
    }
  };

  return { widgetConfigRef, settings, persistSettings, isUpdating };
};
