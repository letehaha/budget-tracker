import type { DashboardWidgetConfig } from '@/api/user-settings';
import { DEFAULT_DASHBOARD_LAYOUT, WIDGET_REGISTRY } from '@/components/widgets/widget-registry';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { cloneDeep } from 'lodash-es';
import { computed, ref } from 'vue';

export function useDashboardLayout() {
  const { data: settings, mutateAsync } = useUserSettings();

  const isEditMode = ref(false);
  const draftWidgets = ref<DashboardWidgetConfig[]>([]);

  const activeWidgets = computed<DashboardWidgetConfig[]>(() => {
    const saved = settings.value?.dashboard?.widgets;
    const layout = saved && saved.length > 0 ? saved : DEFAULT_DASHBOARD_LAYOUT;
    // Filter out unknown widget IDs
    return layout.filter((w) => w.widgetId in WIDGET_REGISTRY);
  });

  const displayWidgets = computed(() => (isEditMode.value ? draftWidgets.value : activeWidgets.value));

  const availableWidgets = computed(() => {
    const currentIds = new Set(draftWidgets.value.map((w) => w.widgetId));
    return Object.values(WIDGET_REGISTRY).filter((def) => !currentIds.has(def.id));
  });

  const enterEditMode = () => {
    draftWidgets.value = cloneDeep(activeWidgets.value);
    isEditMode.value = true;
  };

  const saveLayout = async () => {
    const currentSettings = settings.value;
    if (!currentSettings) return;

    await mutateAsync({
      ...currentSettings,
      dashboard: { widgets: draftWidgets.value },
    });
    isEditMode.value = false;
  };

  const cancelEdit = () => {
    draftWidgets.value = [];
    isEditMode.value = false;
  };

  const removeWidget = ({ widgetId }: { widgetId: string }) => {
    draftWidgets.value = draftWidgets.value.filter((w) => w.widgetId !== widgetId);
  };

  const addWidget = ({ widgetId }: { widgetId: string }) => {
    const def = WIDGET_REGISTRY[widgetId];
    if (!def) return;
    draftWidgets.value.push({ widgetId, colSpan: def.defaultColSpan, rowSpan: def.defaultRowSpan });
  };

  const resizeWidget = ({ widgetId, colSpan, rowSpan }: { widgetId: string; colSpan: number; rowSpan: number }) => {
    const widget = draftWidgets.value.find((w) => w.widgetId === widgetId);
    if (widget) {
      widget.colSpan = colSpan;
      widget.rowSpan = rowSpan;
    }
  };

  const updateWidgetConfig = ({ widgetId, key, value }: { widgetId: string; key: string; value: unknown }) => {
    const widget = draftWidgets.value.find((w) => w.widgetId === widgetId);
    if (widget) {
      widget.config = { ...widget.config, [key]: value };
    }
  };

  return {
    isEditMode,
    activeWidgets,
    draftWidgets,
    displayWidgets,
    availableWidgets,
    enterEditMode,
    saveLayout,
    cancelEdit,
    removeWidget,
    addWidget,
    resizeWidget,
    updateWidgetConfig,
  };
}
