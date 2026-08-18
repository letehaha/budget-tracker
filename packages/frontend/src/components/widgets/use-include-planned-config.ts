import type { DashboardWidgetConfig } from '@/api/user-settings';
import { useNotificationCenter } from '@/components/notification-center';
import { i18n } from '@/i18n';
import { ApiErrorResponseError } from '@/js/errors';
import { type Ref, computed, inject } from 'vue';

/**
 * A widget counts pending planned transactions unless its config opts out, so every reader
 * treats a missing key as `true`.
 */
export const readIncludePlanned = ({ config }: { config: Record<string, unknown> | undefined }): boolean =>
  config?.includePlanned !== false;

/**
 * A failed save leaves the switch snapped back to the persisted value, which reads as the
 * toggle being ignored unless the failure is surfaced.
 */
export const useIncludePlannedSaveError = () => {
  const { addErrorNotification } = useNotificationCenter();

  return ({ error }: { error: unknown }) => {
    if (error instanceof ApiErrorResponseError) {
      addErrorNotification(error.data.message ?? error.message);
    } else {
      // eslint-disable-next-line no-console
      console.error(error);
      addErrorNotification(i18n.global.t('dashboard.widgets.common.includePlannedSaveError'));
    }
  };
};

/**
 * Reads and persists a dashboard widget's `includePlanned` flag through the shared
 * widget-config injections, so every widget stores the same key the same way.
 */
export const useIncludePlannedConfig = () => {
  const widgetConfigRef = inject<Ref<DashboardWidgetConfig> | null>('dashboard-widget-config', null);
  const saveWidgetConfig =
    inject<(params: { widgetId: string; config: Record<string, unknown> }) => Promise<void>>(
      'dashboard-save-widget-config',
    );

  const notifySaveError = useIncludePlannedSaveError();

  const includePlanned = computed<boolean>(() => readIncludePlanned({ config: widgetConfigRef?.value?.config }));

  const setIncludePlanned = async ({ value }: { value: boolean }) => {
    if (!saveWidgetConfig || !widgetConfigRef?.value) return;

    try {
      await saveWidgetConfig({
        widgetId: widgetConfigRef.value.widgetId,
        config: { includePlanned: value },
      });
    } catch (error) {
      notifySaveError({ error });
    }
  };

  return { widgetConfigRef, includePlanned, setIncludePlanned };
};
