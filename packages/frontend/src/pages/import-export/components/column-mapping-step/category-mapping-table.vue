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
                <CategorySelectField
                  :model-value="getCategoryModelValue(categoryName)"
                  :values="formattedCategories"
                  label-key="name"
                  :placeholder="$t('pages.importExport.categoryMapping.selectCategory')"
                  popover-class-name="min-w-60"
                  @update:model-value="handleCategorySelect(categoryName, $event)"
                />
              </div>
              <i18n-t
                v-else-if="getCategoryAction(categoryName) === 'create-new'"
                keypath="pages.importExport.categoryMappingTable.willBeCreatedOrMerged"
                tag="div"
                class="text-muted-foreground text-sm"
              >
                <template #name>
                  <span class="text-foreground font-medium">{{ categoryName }}</span>
                </template>
                <template #action>
                  <span class="text-foreground font-semibold">{{
                    t('pages.importExport.categoryMappingTable.createdOrMergedAction')
                  }}</span>
                </template>
              </i18n-t>
              <div v-else class="text-muted-foreground text-sm">—</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type FormattedCategory } from '@/common/types';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import SelectField from '@/components/fields/select-field.vue';
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
const { categories, formattedCategories } = storeToRefs(categoriesStore);

const actionOptions = computed<OptionItem[]>(() => [
  { label: t('pages.importExport.categoryMappingTable.actions.createNew'), value: 'create-new' },
  { label: t('pages.importExport.categoryMappingTable.actions.mapToExisting'), value: 'link-existing' },
]);

onMounted(async () => {
  if (categories.value.length === 0) {
    await categoriesStore.loadCategories();
  }
});

// Flat id→FormattedCategory lookup built by recursively traversing the hierarchy,
// used to resolve a stored categoryId back to the FormattedCategory object the picker expects.
const flatCategoriesById = computed<Map<string, FormattedCategory>>(() => {
  const map = new Map<string, FormattedCategory>();

  const traverse = (items: FormattedCategory[]) => {
    for (const item of items) {
      map.set(item.id, item);
      if (item.subCategories?.length > 0) {
        traverse(item.subCategories);
      }
    }
  };

  traverse(formattedCategories.value);
  return map;
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
    // categoryId is empty until the user selects a target; the Continue gate in
    // index.vue requires a non-empty categoryId before allowing progression.
    importStore.categoryMapping[categoryName] = { action: 'link-existing', categoryId: '' };
  }
};

// Resolve the stored categoryId string to the FormattedCategory the picker needs.
// Returns null when no category has been chosen yet (categoryId is empty).
const getCategoryModelValue = (categoryName: string): FormattedCategory | null => {
  const mapping = importStore.categoryMapping[categoryName];
  if (mapping?.action !== 'link-existing' || !mapping.categoryId) return null;
  return flatCategoriesById.value.get(mapping.categoryId) ?? null;
};

const handleCategorySelect = (categoryName: string, category: FormattedCategory | null) => {
  if (category) {
    importStore.categoryMapping[categoryName] = { action: 'link-existing', categoryId: category.id };
  } else {
    // Cleared — keep link-existing mode so the picker stays visible; categoryId is
    // empty so the Continue gate (index.vue canContinue) holds the row incomplete.
    importStore.categoryMapping[categoryName] = { action: 'link-existing', categoryId: '' };
  }
};
</script>
