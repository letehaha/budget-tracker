import type { DashboardWidgetConfig } from '@/api/user-settings';
import { type Ref, computed, inject } from 'vue';

/**
 * Reads and persists a dashboard widget's excluded-category list through the
 * shared widget-config injection. Both the cash-flow and expenses-structure
 * widgets read/save the same `excludedCategoryIds` shape, so the injection
 * wiring lives here once instead of being copied into each widget.
 */
export const useCategoryExclusionsConfig = () => {
  const widgetConfigRef = inject<Ref<DashboardWidgetConfig> | null>('dashboard-widget-config', null);
  const saveWidgetConfig =
    inject<(params: { widgetId: string; config: Record<string, unknown> }) => Promise<void>>(
      'dashboard-save-widget-config',
    );

  const excludedCategoryIds = computed<string[]>(() => {
    const ids = widgetConfigRef?.value?.config?.excludedCategoryIds;
    if (!Array.isArray(ids)) return [];
    return ids.filter((id): id is string => typeof id === 'string');
  });

  const persistExcludedCategories = async ({ categoryIds }: { categoryIds: string[] }) => {
    if (!saveWidgetConfig || !widgetConfigRef?.value) return;

    await saveWidgetConfig({
      widgetId: widgetConfigRef.value.widgetId,
      config: { excludedCategoryIds: categoryIds },
    });
  };

  return { widgetConfigRef, excludedCategoryIds, persistExcludedCategories };
};
