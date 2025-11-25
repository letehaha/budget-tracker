<template>
  <div class="bg-muted/30 mt-6 rounded-lg border p-4">
    <h3 class="mb-4 text-sm font-semibold">Category Assignment <span class="text-destructive-text">*</span></h3>

    <!-- Option Selection -->
    <div class="mb-4">
      <SelectField
        :model-value="selectedOptionObject"
        :values="categoryOptions"
        label="How do you want to assign categories?"
        placeholder="Select option..."
        @update:model-value="handleOptionChange"
      />
      <p class="text-muted-foreground mt-1 text-xs">
        Choose how categories should be assigned to imported transactions
      </p>
    </div>

    <!-- Column Selection (for map-data-source-column and create-new-categories) -->
    <div
      v-if="
        selectedOption === CategoryOptionValue.mapDataSourceColumn ||
        selectedOption === CategoryOptionValue.createNewCategories
      "
    >
      <SelectField
        :model-value="categoryColumnObject"
        :values="columnOptions"
        label="Category Column"
        placeholder="Select column..."
        @update:model-value="handleColumnChange"
      />
      <p class="text-muted-foreground mt-1 text-xs">Select the CSV column that contains category names</p>
    </div>

    <!-- Category Selection (if existing-category) -->
    <div v-if="selectedOption === CategoryOptionValue.existingCategory">
      <SelectField
        :model-value="selectedCategory"
        :values="categories"
        label="Category"
        label-key="name"
        value-key="id"
        placeholder="Select category..."
        with-search
        :search-keys="['name']"
        @update:model-value="handleCategorySelect"
      />
      <p class="text-muted-foreground mt-1 text-xs">All imported transactions will be assigned to this category</p>
    </div>

    <p
      v-if="
        selectedOption === CategoryOptionValue.mapDataSourceColumn ||
        selectedOption === CategoryOptionValue.createNewCategories
      "
      class="bg-primary/10 border-primary mt-4 rounded-lg border p-3 text-sm"
    >
      <template v-if="selectedOption === CategoryOptionValue.mapDataSourceColumn">
        ℹ️ You'll map each CSV category to your existing categories on the next step
      </template>
      <template v-else-if="selectedOption === CategoryOptionValue.createNewCategories">
        ℹ️ New high-level categories will be created automatically from unique values in your CSV file
      </template>
    </p>
  </div>
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { useCategoriesStore } from '@/stores';
import { useImportExportStore } from '@/stores/import-export';
import { CategoryModel, CategoryOptionValue } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed, onMounted } from 'vue';

interface OptionItem {
  label: string;
  value: string;
}

const importStore = useImportExportStore();
const categoriesStore = useCategoriesStore();
const { categories } = storeToRefs(categoriesStore);

onMounted(async () => {
  // Ensure categories are loaded
  if (categories.value.length === 0) {
    await categoriesStore.loadCategories();
  }
});

const categoryOptions: OptionItem[] = [
  {
    label: 'Map each CSV category to existing categories (on next step)',
    value: CategoryOptionValue.mapDataSourceColumn,
  },
  {
    label: 'Create new categories from CSV values',
    value: CategoryOptionValue.createNewCategories,
  },
  {
    label: 'Assign all to single existing category',
    value: CategoryOptionValue.existingCategory,
  },
];

const columnOptions = computed<OptionItem[]>(() =>
  importStore.csvHeaders.map((header) => ({
    label: header,
    value: header,
  })),
);

const selectedOption = computed(() => {
  if (!importStore.columnMapping.category) return '';
  return importStore.columnMapping.category.option;
});

const selectedOptionObject = computed(() => {
  if (!selectedOption.value) return null;
  return categoryOptions.find((opt) => opt.value === selectedOption.value) ?? null;
});

const categoryColumn = computed(() => {
  const cat = importStore.columnMapping.category;
  if (
    cat &&
    (cat.option === CategoryOptionValue.mapDataSourceColumn || cat.option === CategoryOptionValue.createNewCategories)
  ) {
    return cat.columnName;
  }
  return null;
});

const categoryColumnObject = computed(() => {
  if (!categoryColumn.value) return null;
  return columnOptions.value.find((opt) => opt.value === categoryColumn.value) ?? null;
});

const selectedCategory = computed<CategoryModel | null>(() => {
  const cat = importStore.columnMapping.category;
  if (cat && cat.option === CategoryOptionValue.existingCategory) {
    return categories.value.find((c) => c.id === cat.categoryId) ?? null;
  }
  return null;
});

const handleOptionChange = (option: OptionItem | null) => {
  if (!option) {
    importStore.columnMapping.category = null;
    return;
  }

  switch (option.value) {
    case CategoryOptionValue.mapDataSourceColumn:
      importStore.columnMapping.category = { option: CategoryOptionValue.mapDataSourceColumn, columnName: '' };
      break;
    case CategoryOptionValue.createNewCategories:
      importStore.columnMapping.category = { option: CategoryOptionValue.createNewCategories, columnName: '' };
      break;
    case CategoryOptionValue.existingCategory:
      importStore.columnMapping.category = { option: CategoryOptionValue.existingCategory, categoryId: 0 };
      break;
  }
};

const handleColumnChange = (column: OptionItem | null) => {
  const currentOption = importStore.columnMapping.category;

  if (
    column &&
    currentOption &&
    (currentOption.option === CategoryOptionValue.mapDataSourceColumn ||
      currentOption.option === CategoryOptionValue.createNewCategories)
  ) {
    importStore.columnMapping.category = { option: currentOption.option, columnName: column.value };
  }
};

const handleCategorySelect = (category: CategoryModel | null) => {
  if (category) {
    importStore.columnMapping.category = { option: CategoryOptionValue.existingCategory, categoryId: category.id };
  }
};
</script>
