<template>
  <div>
    <h3 class="mb-3 text-sm font-semibold">{{ t('pages.importExport.tagMappingTable.title') }}</h3>
    <p class="text-muted-foreground mb-4 text-sm">
      {{ t('pages.importExport.tagMappingTable.description') }}
    </p>

    <!-- @container so column widths react to available content width, not viewport -->
    <div class="@container overflow-x-auto rounded-lg border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="border-b px-4 py-3 text-left font-medium">
              {{ t('pages.importExport.tagMappingTable.csvTagName') }}
            </th>
            <th class="border-b px-4 py-3 text-left font-medium">
              {{ t('pages.importExport.tagMappingTable.action') }}
            </th>
            <th class="border-b px-4 py-3 text-left font-medium">
              {{ t('pages.importExport.tagMappingTable.targetTag') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tagName in importStore.uniqueTagsInCSV" :key="tagName" class="border-b last:border-b-0">
            <td class="px-4 py-3 font-medium">{{ tagName }}</td>

            <td class="px-4 py-3">
              <SelectField
                :model-value="getTagActionObject(tagName)"
                :values="actionOptions"
                :placeholder="$t('pages.importExport.common.selectAction')"
                @update:model-value="handleActionChange(tagName, $event)"
              />
            </td>

            <td class="px-4 py-3">
              <!-- Link to existing tag: plain native select driven by the tags store.
                   tag-select-field.vue is multi-select and popover-based — a plain
                   Select.Select is a better fit here (mirrors category-mapping-table). -->
              <div v-if="getTagAction(tagName) === 'link-existing'">
                <Select.Select
                  :model-value="getTagSelectValue(tagName)"
                  @update:model-value="handleTagSelect(tagName, String($event))"
                >
                  <Select.SelectTrigger class="h-9">
                    <Select.SelectValue :placeholder="$t('pages.importExport.tagMappingTable.selectTag')">
                      {{ getTagDisplayValue(tagName) }}
                    </Select.SelectValue>
                  </Select.SelectTrigger>
                  <Select.SelectContent>
                    <Select.SelectItem v-for="tag in tags" :key="tag.id" :value="String(tag.id)">
                      {{ tag.name }}
                    </Select.SelectItem>
                  </Select.SelectContent>
                </Select.Select>
              </div>

              <div v-else-if="getTagAction(tagName) === 'create-new'" class="text-muted-foreground text-sm">
                {{ t('pages.importExport.tagMappingTable.willBeCreated', { name: tagName }) }}
              </div>

              <div v-else-if="getTagAction(tagName) === 'skip'" class="text-muted-foreground text-sm">
                {{ t('pages.importExport.tagMappingTable.willBeSkipped') }}
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
import { useImportExportStore } from '@/stores/import-export';
import { useTagsStore } from '@/stores/tags';
import { storeToRefs } from 'pinia';
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface OptionItem {
  label: string;
  value: string;
}

const importStore = useImportExportStore();
const tagsStore = useTagsStore();
const { tags } = storeToRefs(tagsStore);

onMounted(async () => {
  // Ensure tags are loaded so the "link existing" picker is populated.
  if (tags.value.length === 0) {
    await tagsStore.loadTags();
  }
});

const actionOptions = computed<OptionItem[]>(() => [
  { label: t('pages.importExport.tagMappingTable.actions.createNew'), value: 'create-new' },
  { label: t('pages.importExport.tagMappingTable.actions.mapToExisting'), value: 'link-existing' },
  { label: t('pages.importExport.tagMappingTable.actions.skip'), value: 'skip' },
]);

const getTagAction = (tagName: string): string => {
  const mapping = importStore.tagMapping[tagName];
  if (!mapping) return '';
  return mapping.action;
};

const getTagActionObject = (tagName: string): OptionItem | null => {
  const action = getTagAction(tagName);
  if (!action) return null;
  return actionOptions.value.find((opt) => opt.value === action) ?? null;
};

const handleActionChange = (tagName: string, option: OptionItem | null) => {
  if (!option) {
    delete importStore.tagMapping[tagName];
    return;
  }

  const action = option.value;
  if (action === 'create-new') {
    importStore.tagMapping[tagName] = { action: 'create-new' };
  } else if (action === 'link-existing') {
    // Await tag selection — no tagId yet
    importStore.tagMapping[tagName] = { action: 'link-existing', tagId: '' };
  } else if (action === 'skip') {
    importStore.tagMapping[tagName] = { action: 'skip' };
  }
};

const handleTagSelect = (tagName: string, value: string) => {
  if (value) {
    importStore.tagMapping[tagName] = { action: 'link-existing', tagId: value };
  }
};

const getTagSelectValue = (tagName: string): string => {
  const mapping = importStore.tagMapping[tagName];
  if (mapping?.action === 'link-existing' && mapping.tagId) {
    return mapping.tagId;
  }
  return '';
};

const getTagDisplayValue = (tagName: string): string => {
  const mapping = importStore.tagMapping[tagName];
  if (mapping?.action === 'link-existing' && mapping.tagId) {
    const tag = tags.value.find((tg) => tg.id === mapping.tagId);
    return tag ? tag.name : t('pages.importExport.tagMappingTable.selectTag');
  }
  return t('pages.importExport.tagMappingTable.selectTag');
};
</script>
