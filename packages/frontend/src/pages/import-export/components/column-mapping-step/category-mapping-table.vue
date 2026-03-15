<template>
  <div>
    <h3 class="mb-3 text-sm font-semibold">{{ t('pages.importExport.categoryMappingTable.title') }}</h3>
    <p class="text-muted-foreground mb-4 text-sm">
      {{ t('pages.importExport.categoryMappingTable.description') }}
    </p>

    <div class="overflow-x-auto rounded-lg border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="border-b px-4 py-3 text-left font-medium">
              {{ t('pages.importExport.categoryMappingTable.csvCategoryName') }}
            </th>
            <th class="border-b px-4 py-3 text-left font-medium">
              {{ t('pages.importExport.categoryMappingTable.action') }}
            </th>
            <th class="border-b px-4 py-3 text-left font-medium">
              {{ t('pages.importExport.categoryMappingTable.targetCategory') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="categoryName in importStore.uniqueCategoriesInCSV"
            :key="categoryName"
            class="border-b last:border-b-0"
          >
            <td class="px-4 py-3 font-medium">{{ categoryName }}</td>
            <td class="px-4 py-3">
              <SelectField
                :model-value="getCategoryActionObject(categoryName)"
                :values="actionOptions"
                :placeholder="$t('pages.importExport.common.selectAction')"
                @update:model-value="handleActionChange(categoryName, $event)"
              />
            </td>
            <td class="px-4 py-3">
              <div v-if="getCategoryAction(categoryName) === 'link-existing'">
                <Select.Select
                  :model-value="getCategorySelectValue(categoryName)"
                  @update:model-value="handleCategorySelect(categoryName, String($event))"
                >
                  <Select.SelectTrigger class="h-9">
                    <Select.SelectValue :placeholder="$t('pages.importExport.categoryMapping.selectCategory')">
                      {{ getCategoryDisplayValue(categoryName) }}
                    </Select.SelectValue>
                  </Select.SelectTrigger>
                  <Select.SelectContent>
                    <Select.SelectItem
                      v-for="category in categories"
                      :key="category.id"
                      :value="String(category.id)"
                      :disabled="isCategoryMapped(category.id, categoryName)"
                    >
                      <span :class="{ 'text-muted-foreground': isCategoryMapped(category.id, categoryName) }">
                        {{ category.name }}
                        <span v-if="isCategoryMapped(category.id, categoryName)" class="text-muted-foreground text-xs">
                          —
                          {{
                            t('pages.importExport.categoryMappingTable.mappedTo', {
                              name: getMappedToCategoryName(category.id),
                            })
                          }}
                        </span>
                      </span>
                    </Select.SelectItem>
                  </Select.SelectContent>
                </Select.Select>
              </div>
              <div v-else-if="getCategoryAction(categoryName) === 'create-new'" class="text-muted-foreground text-sm">
                {{ t('pages.importExport.categoryMappingTable.willBeCreated', { name: categoryName }) }}
              </div>
              <div v-else class="text-muted-foreground text-sm">—</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import * as Select from '@/components/lib/ui/select';
import { useCategoriesStore } from '@/stores';
import { useImportExportStore } from '@/stores/import-export';
import { storeToRefs } from 'pinia';
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface OptionItem {
  label: string;
  value: string;
}

const importStore = useImportExportStore();
const categoriesStore = useCategoriesStore();
const { categories } = storeToRefs(categoriesStore);

const actionOptions = computed<OptionItem[]>(() => [
  { label: t('pages.importExport.categoryMappingTable.actions.createNew'), value: 'create-new' },
  { label: t('pages.importExport.categoryMappingTable.actions.mapToExisting'), value: 'link-existing' },
]);

onMounted(async () => {
  // Ensure categories are loaded
  if (categories.value.length === 0) {
    await categoriesStore.loadCategories();
  }
});

// Create a reverse mapping to find which CSV category name maps to which system category ID
const categoryIdToCSVName = computed(() => {
  const mapping: Record<number, string> = {};
  for (const [csvName, value] of Object.entries(importStore.categoryMapping)) {
    if (value.action === 'link-existing') {
      mapping[value.categoryId] = csvName;
    }
  }
  return mapping;
});

const getCategoryAction = (categoryName: string): string => {
  const mapping = importStore.categoryMapping[categoryName];
  if (!mapping) return '';
  return mapping.action;
};

const getCategoryActionObject = (categoryName: string): OptionItem | null => {
  const action = getCategoryAction(categoryName);
  if (!action) return null;
  return actionOptions.value.find((opt) => opt.value === action) ?? null;
};

const handleActionChange = (categoryName: string, option: OptionItem | null) => {
  if (!option) {
    delete importStore.categoryMapping[categoryName];
    return;
  }

  const action = option.value;
  if (action === 'create-new') {
    importStore.categoryMapping[categoryName] = { action: 'create-new' };
  } else if (action === 'link-existing') {
    // Set action but no categoryId yet - user needs to select
    importStore.categoryMapping[categoryName] = { action: 'link-existing', categoryId: 0 };
  }
};

const handleCategorySelect = (categoryName: string, value: string) => {
  const categoryId = Number(value);
  if (categoryId) {
    importStore.categoryMapping[categoryName] = { action: 'link-existing', categoryId };
  }
};

const getCategorySelectValue = (categoryName: string): string => {
  const mapping = importStore.categoryMapping[categoryName];
  if (mapping?.action === 'link-existing' && mapping.categoryId) {
    return String(mapping.categoryId);
  }
  return '';
};

const getCategoryDisplayValue = (categoryName: string): string => {
  const mapping = importStore.categoryMapping[categoryName];
  if (mapping?.action === 'link-existing' && mapping.categoryId) {
    const category = categories.value.find((cat) => cat.id === mapping.categoryId);
    return category ? category.name : t('pages.importExport.categoryMappingTable.selectCategory');
  }
  return t('pages.importExport.categoryMappingTable.selectCategory');
};

const isCategoryMapped = (categoryId: number, currentCategoryName: string): boolean => {
  // Check if this category ID is already mapped to a different CSV category
  const mappedTo = categoryIdToCSVName.value[categoryId];
  return mappedTo !== undefined && mappedTo !== currentCategoryName;
};

const getMappedToCategoryName = (categoryId: number): string => {
  return categoryIdToCSVName.value[categoryId] || '';
};
</script>
