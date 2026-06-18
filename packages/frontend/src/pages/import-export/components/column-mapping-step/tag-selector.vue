<template>
  <div class="bg-muted/30 mt-6 rounded-lg border p-4">
    <h3 class="mb-4 text-sm font-semibold">
      {{ t('pages.importExport.tagAssignment.title') }}
    </h3>

    <!-- Option: enable or disable tag column mapping -->
    <div class="mb-4">
      <SelectField
        :model-value="selectedOptionObject"
        :values="tagOptions"
        :label="t('pages.importExport.tagAssignment.howToAssign')"
        :placeholder="$t('pages.importExport.tagAssignment.noTagsOption')"
        @update:model-value="handleOptionChange"
      />
      <p class="text-muted-foreground mt-1 text-xs">
        {{ t('pages.importExport.tagAssignment.description') }}
      </p>
    </div>

    <!-- CSV column picker (shown when map-data-source-column is active) -->
    <div v-if="selectedOption === TagOptionValue.mapDataSourceColumn">
      <SelectField
        :model-value="tagColumnObject"
        :values="columnOptions"
        :label="t('pages.importExport.tagAssignment.tagColumn')"
        :placeholder="$t('pages.importExport.common.selectColumn')"
        @update:model-value="handleColumnChange"
      />
      <p class="text-muted-foreground mt-1 text-xs">
        {{ t('pages.importExport.tagAssignment.columnDescription') }}
      </p>
    </div>

    <div
      v-if="selectedOption === TagOptionValue.mapDataSourceColumn"
      class="bg-primary/10 border-primary mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm"
    >
      <InfoIcon class="text-primary mt-0.5 size-4 shrink-0" />
      <p>{{ t('pages.importExport.tagAssignment.mapOnNextStep') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { useImportExportStore } from '@/stores/import-export';
import { TagOptionValue } from '@bt/shared/types';
import { InfoIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface OptionItem {
  label: string;
  value: string;
}

const importStore = useImportExportStore();

const tagOptions = computed<OptionItem[]>(() => [
  {
    label: t('pages.importExport.tagAssignment.options.mapToColumn'),
    value: TagOptionValue.mapDataSourceColumn,
  },
]);

const columnOptions = computed<OptionItem[]>(() =>
  importStore.csvHeaders.map((header) => ({
    label: header,
    value: header,
  })),
);

const selectedOption = computed(() => {
  if (!importStore.columnMapping.tags) return null;
  return importStore.columnMapping.tags.option;
});

const selectedOptionObject = computed<OptionItem | null>(() => {
  if (!selectedOption.value) return null;
  return tagOptions.value.find((opt) => opt.value === selectedOption.value) ?? null;
});

const tagColumn = computed<string | null>(() => {
  const tags = importStore.columnMapping.tags;
  if (tags && tags.option === TagOptionValue.mapDataSourceColumn) {
    return tags.columnName || null;
  }
  return null;
});

const tagColumnObject = computed<OptionItem | null>(() => {
  if (!tagColumn.value) return null;
  return columnOptions.value.find((opt) => opt.value === tagColumn.value) ?? null;
});

// Deselecting the tags column or switching its source column must drop any
// previously-extracted tag state. Otherwise stale tagMapping/uniqueTagsInCSV
// linger and the backend would create tags the user opted out of (or tags from
// the previous column).
const clearExtractedTagState = () => {
  importStore.uniqueTagsInCSV = [];
  importStore.tagMapping = {};
};

const handleOptionChange = (option: OptionItem | null) => {
  if (!option) {
    importStore.columnMapping.tags = null;
    clearExtractedTagState();
    return;
  }
  if (option.value === TagOptionValue.mapDataSourceColumn) {
    importStore.columnMapping.tags = { option: TagOptionValue.mapDataSourceColumn, columnName: '' };
    clearExtractedTagState();
  }
};

const handleColumnChange = (column: OptionItem | null) => {
  if (column && importStore.columnMapping.tags?.option === TagOptionValue.mapDataSourceColumn) {
    importStore.columnMapping.tags = { option: TagOptionValue.mapDataSourceColumn, columnName: column.value };
    // A different source column yields different tag strings; discard the old
    // extraction so the next extract repopulates from the newly chosen column.
    clearExtractedTagState();
  }
};
</script>
