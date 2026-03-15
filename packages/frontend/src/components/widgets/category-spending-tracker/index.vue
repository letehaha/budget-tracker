<script lang="ts" setup>
import type { DashboardWidgetConfig } from '@/api/user-settings';
import CategoryCircle from '@/components/common/category-circle.vue';
import { buttonVariants, Button } from '@/components/lib/ui/button';
import { useFormatCurrency } from '@/composable/formatters';
import { ROUTES_NAMES } from '@/routes/constants';
import { useCategoriesStore } from '@/stores/categories/categories';
import { format } from 'date-fns';
import { GripVerticalIcon, PencilIcon, PlusIcon, Trash2Icon, SaveIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import type { Ref } from 'vue';
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { VueDraggable } from 'vue-draggable-plus';

import WidgetWrapper from '../components/widget-wrapper.vue';
import CategoryPickerDialog from './category-picker-dialog.vue';
import { useCategorySpendingData } from './use-category-spending-data';

const { t } = useI18n();

const props = defineProps<{
  selectedPeriod: { from: Date; to: Date };
}>();

const router = useRouter();
const { formatBaseCurrency } = useFormatCurrency();
const { categories, categoriesMap } = storeToRefs(useCategoriesStore());

const widgetConfigRef = inject<Ref<DashboardWidgetConfig> | null>('dashboard-widget-config', null);
const saveWidgetConfig =
  inject<(params: { widgetId: string; config: Record<string, unknown> }) => Promise<void>>(
    'dashboard-save-widget-config',
  );

const selectedCategoryIds = computed<number[]>(() => {
  const ids = widgetConfigRef?.value?.config?.selectedCategoryIds;
  return Array.isArray(ids) ? (ids as number[]) : [];
});

const MAX_SLOTS_LARGE = 16;
const MAX_SLOTS_SMALL = 7;

const maxSlots = computed(() => {
  const config = widgetConfigRef?.value;
  if (!config) return MAX_SLOTS_SMALL;
  return (config.rowSpan ?? 1) >= 2 ? MAX_SLOTS_LARGE : MAX_SLOTS_SMALL;
});

const { spendingByCategory, isFetching, hasData } = useCategorySpendingData({
  selectedPeriod: () => props.selectedPeriod,
  categoryIds: selectedCategoryIds,
});

const categoryRows = computed(() =>
  selectedCategoryIds.value.map((catId) => {
    const data = spendingByCategory.value[catId];
    const category = categoriesMap.value[catId];

    return {
      id: catId,
      name: category?.name ?? data?.name ?? t('common.labels.unknown'),
      color: category?.color ?? data?.color ?? '#000000',
      netAmount: data?.netAmount ?? 0,
    };
  }),
);

// Mutable copy for drag-and-drop reordering
const draggableRows = ref<typeof categoryRows.value>([]);

const syncDraggableRows = () => {
  draggableRows.value = [...categoryRows.value];
};

const isCustomizing = ref(false);

// Sync adds/removes to draggable list without overriding drag order
watch(categoryRows, (rows) => {
  if (!isCustomizing.value) return;

  const currentIds = new Set(draggableRows.value.map((r) => r.id));
  const newIds = new Set(rows.map((r) => r.id));

  // Add newly appeared rows at the end
  for (const row of rows) {
    if (!currentIds.has(row.id)) {
      draggableRows.value.push(row);
    }
  }

  // Remove rows that no longer exist
  draggableRows.value = draggableRows.value.filter((r) => newIds.has(r.id));
});

const ghostSlotCount = computed(() => Math.max(0, maxSlots.value - categoryRows.value.length));
const isInitialLoading = computed(() => isFetching.value && !hasData.value && selectedCategoryIds.value.length > 0);

const pickerOpen = ref(false);
// Category ID being replaced, or null for "add new"
const replacingCategoryId = ref<number | null>(null);

const disabledCategoryIds = computed(() => {
  if (replacingCategoryId.value !== null) {
    // When replacing, disable all except the one being replaced
    return selectedCategoryIds.value.filter((id) => id !== replacingCategoryId.value);
  }
  return selectedCategoryIds.value;
});

const openPickerForAdd = () => {
  replacingCategoryId.value = null;
  pickerOpen.value = true;
};

const openPickerForReplace = ({ categoryId }: { categoryId: number }) => {
  replacingCategoryId.value = categoryId;
  pickerOpen.value = true;
};

const persistCategories = async ({ categoryIds }: { categoryIds: number[] }) => {
  if (!saveWidgetConfig || !widgetConfigRef?.value) return;

  await saveWidgetConfig({
    widgetId: widgetConfigRef.value.widgetId,
    config: { selectedCategoryIds: categoryIds },
  });
};

const handleCategorySelected = ({ categoryId }: { categoryId: number }) => {
  const ids = [...selectedCategoryIds.value];

  if (replacingCategoryId.value !== null) {
    const idx = ids.indexOf(replacingCategoryId.value);
    if (idx >= 0) ids[idx] = categoryId;
  } else {
    ids.push(categoryId);
  }

  persistCategories({ categoryIds: ids });
};

const removeCategory = ({ categoryId }: { categoryId: number }) => {
  const ids = selectedCategoryIds.value.filter((id) => id !== categoryId);
  persistCategories({ categoryIds: ids });

  // Update draggable list immediately
  draggableRows.value = draggableRows.value.filter((r) => r.id !== categoryId);

  if (ids.length === 0) {
    isCustomizing.value = false;
  }
};

const enterCustomize = () => {
  syncDraggableRows();
  isCustomizing.value = true;
};

const exitCustomize = () => {
  // Persist the new order from draggable list
  const reorderedIds = draggableRows.value.map((row) => row.id);

  // Only persist if order actually changed
  const currentIds = selectedCategoryIds.value;
  const orderChanged = reorderedIds.some((id, i) => id !== currentIds[i]);

  if (orderChanged) {
    persistCategories({ categoryIds: reorderedIds });
  }

  isCustomizing.value = false;
};

const getAmountClass = ({ netAmount }: { netAmount: number }) => {
  if (netAmount > 0) return 'text-app-income-color';
  if (netAmount < 0) return 'text-app-expense-color';
  return 'text-muted-foreground';
};

const formatAmount = ({ netAmount }: { netAmount: number }) => {
  if (netAmount > 0) return formatBaseCurrency(netAmount);
  if (netAmount < 0) return `-${formatBaseCurrency(Math.abs(netAmount))}`;
  return formatBaseCurrency(0);
};

const getDescendantIds = ({ categoryId }: { categoryId: number }): number[] => {
  const childrenMap = new Map<number, number[]>();
  for (const cat of categories.value) {
    if (cat.parentId !== null) {
      const children = childrenMap.get(cat.parentId) ?? [];
      children.push(cat.id);
      childrenMap.set(cat.parentId, children);
    }
  }

  const result: number[] = [];
  const queue = [categoryId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    queue.push(...(childrenMap.get(current) ?? []));
  }
  return result;
};

const navigateToTransactions = ({ categoryId }: { categoryId: number }) => {
  if (isCustomizing.value) return;

  const allIds = getDescendantIds({ categoryId });

  router.push({
    name: ROUTES_NAMES.transactions,
    query: {
      categoryIds: allIds.map(String),
      start: format(props.selectedPeriod.from, 'yyyy-MM-dd'),
      end: format(props.selectedPeriod.to, 'yyyy-MM-dd'),
    },
  });
};
</script>

<template>
  <WidgetWrapper :is-fetching="isFetching" data-testid="widget-category-spending-tracker">
    <template #title>{{ t('dashboard.widgets.categoryTracker.title') }}</template>
    <template #action>
      <button
        v-if="categoryRows.length > 0"
        data-testid="cst-customize-toggle"
        :class="
          buttonVariants({
            variant: isCustomizing ? 'default' : 'ghost',
            size: 'icon-sm',
            class: isCustomizing ? '' : 'text-muted-foreground',
          })
        "
        @click="isCustomizing ? exitCustomize() : enterCustomize()"
      >
        <template v-if="isCustomizing">
          <SaveIcon class="size-4" />
        </template>
        <template v-else>
          <PencilIcon class="size-3.5" />
        </template>
      </button>
    </template>

    <template v-if="isInitialLoading">
      <div class="-mx-2 flex flex-col gap-2">
        <div v-for="n in maxSlots" :key="n" class="flex h-9 items-center gap-2 rounded-md px-3">
          <div class="bg-muted size-5 animate-pulse rounded-full" />
          <div class="bg-muted h-4 flex-1 animate-pulse rounded" :style="{ maxWidth: `${40 + ((n * 4) % 10)}%` }" />
          <div class="bg-muted ml-auto h-4 w-14 animate-pulse rounded" />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="-mx-2 flex flex-col gap-2 overflow-y-auto">
        <!-- Customize mode: draggable rows -->
        <VueDraggable
          v-if="isCustomizing"
          v-model="draggableRows"
          handle=".drag-handle"
          :animation="200"
          class="flex flex-col gap-2"
        >
          <div
            v-for="(item, index) in draggableRows"
            :key="item.id"
            class="hover:bg-muted/50 flex h-9 cursor-pointer items-center gap-1 rounded-md py-0.5 pr-3 pl-1 transition-colors"
            @click="openPickerForReplace({ categoryId: item.id })"
          >
            <div
              :class="
                buttonVariants({
                  size: 'icon-sm',
                  variant: 'ghost',
                  class: 'drag-handle cursor-grab active:cursor-grabbing',
                })
              "
              @click.stop
            >
              <GripVerticalIcon class="text-muted-foreground size-4" />
            </div>

            <CategoryCircle :category-id="item.id" />

            <span class="min-w-0 flex-1 truncate text-sm">{{ item.name }}</span>

            <Button
              data-testid="cst-remove-category"
              size="icon-sm"
              variant="ghost-destructive"
              @click.stop="removeCategory({ categoryId: item.id })"
            >
              <Trash2Icon class="size-3.5" />
            </Button>
          </div>
        </VueDraggable>

        <!-- Normal mode: static rows -->
        <template v-else>
          <button
            v-for="item in categoryRows"
            :key="item.id"
            class="hover:bg-muted/50 flex h-9 w-full items-center gap-2 rounded-md px-3 py-0.5 text-left transition-colors"
            @click="navigateToTransactions({ categoryId: item.id })"
          >
            <CategoryCircle :category-id="item.id" />

            <span class="min-w-0 flex-1 truncate text-sm">{{ item.name }}</span>

            <span class="text-amount shrink-0 text-sm" :class="getAmountClass({ netAmount: item.netAmount })">
              {{ formatAmount({ netAmount: item.netAmount }) }}
            </span>
          </button>
        </template>

        <!-- Ghost rows -->
        <button
          v-for="n in ghostSlotCount"
          :key="`ghost-${n}`"
          data-testid="cst-add-slot"
          class="border-muted-foreground/30 hover:bg-muted/50 text-muted-foreground mx-1 flex h-9 items-center gap-2 rounded-md border border-dashed px-2 py-0.5 transition-colors"
          @click="openPickerForAdd"
        >
          <PlusIcon class="size-3.5" />
          <span class="text-sm">{{ t('dashboard.widgets.categoryTracker.addCategory') }}</span>
        </button>
      </div>
    </template>

    <CategoryPickerDialog
      v-model:open="pickerOpen"
      :disabled-category-ids="disabledCategoryIds"
      @select="(id: number) => handleCategorySelected({ categoryId: id })"
    />
  </WidgetWrapper>
</template>
