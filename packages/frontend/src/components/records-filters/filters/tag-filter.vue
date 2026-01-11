<template>
  <Combobox.Combobox
    :model-value="undefined"
    v-model:searchTerm="searchTerm"
    v-model:open="isOpen"
    :multiple="true"
    class="w-full"
  >
    <Combobox.ComboboxAnchor>
      <Combobox.ComboboxTrigger
        class="ring-offset-background focus-visible:ring-ring flex w-full justify-between rounded-md text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-sm font-medium"
          >
            {{ isAllSelected ? tagsCount : selectedTagIds.length }}
          </span>
          <span class="font-medium">
            {{
              isAllSelected
                ? $t('transactions.filters.tags.allTags')
                : `${selectedTagIds.length === 1 ? $t('transactions.filters.tags.tagSingular') : $t('transactions.filters.tags.tagPlural')} ${$t('transactions.filters.tags.selected')}`
            }}
          </span>
        </div>

        <template v-if="!isAllSelected && selectedTagIds.length > 0">
          <Button variant="ghost" size="icon" class="size-6" @click.stop="clearSelection">
            <XIcon class="text-muted-foreground size-4" />
          </Button>
        </template>
        <template v-else>
          <div class="size-6 p-1">
            <ChevronDown class="text-muted-foreground size-4" />
          </div>
        </template>
      </Combobox.ComboboxTrigger>
    </Combobox.ComboboxAnchor>

    <Combobox.ComboboxList
      class="max-h-100 w-(--reka-combobox-trigger-width) lg:max-h-75"
      :side="dropdownSide"
      :avoid-collisions="false"
    >
      <div class="relative w-full items-center p-2 pb-0">
        <Combobox.ComboboxInput
          class="h-9 w-full rounded-md border pl-9 focus-visible:ring-0"
          :placeholder="$t('transactions.filters.tags.searchPlaceholder')"
        />
        <SearchIcon class="text-muted-foreground absolute top-[60%] left-4 size-5 -translate-y-1/2" />
      </div>
      <div class="max-h-85 overflow-y-auto p-1.25 lg:max-h-60">
        <Combobox.ComboboxEmpty class="text-mauve8 py-2 text-center text-xs font-medium" />

        <Combobox.ComboboxGroup>
          <Combobox.ComboboxItem
            v-for="tag in displayedTags"
            :key="tag.id"
            :value="tag"
            class="hover:bg-accent hover:text-accent-foreground flex-start flex cursor-pointer items-center justify-between rounded-md px-2 py-1"
            @select.prevent="pickTag(tag)"
          >
            <div class="flex items-center gap-2">
              <div class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: tag.color }" />
              <TagIcon v-if="tag.icon" :name="tag.icon" class="text-muted-foreground size-4 shrink-0" />
              <span class="truncate">{{ tag.name }}</span>
            </div>
            <CheckIcon v-if="isTagSelected(tag.id)" />
          </Combobox.ComboboxItem>
        </Combobox.ComboboxGroup>
      </div>
    </Combobox.ComboboxList>
  </Combobox.Combobox>
</template>

<script setup lang="ts">
import TagIcon from '@/components/common/icons/tag-icon.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Combobox from '@/components/lib/ui/combobox';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import { useTagsStore } from '@/stores';
import { TagModel } from '@bt/shared/types';
import { isEqual } from 'lodash-es';
import { CheckIcon, ChevronDown, SearchIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  tagIds: number[];
}>();

const emit = defineEmits<{
  'update:tagIds': [value: number[]];
}>();

const searchTerm = ref('');
const isOpen = ref(false);

const { tags } = storeToRefs(useTagsStore());

const isMobile = useWindowBreakpoints(1024);
const dropdownSide = computed(() => (isMobile.value ? 'top' : 'bottom'));

const tagsCount = computed(() => tags.value.length);

const selectedTagIds = ref<number[]>([]);

// Sync internal state when props change (and differ from current state)
watch(
  () => props.tagIds,
  (newIds) => {
    // Only sync if values actually differ (prevents loops)
    if (isEqual([...newIds].sort(), [...selectedTagIds.value].sort())) return;

    selectedTagIds.value = [...newIds];
  },
  { immediate: true },
);

const isAllSelected = computed(() => selectedTagIds.value.length === 0);

const baseSortedTags = computed(() => {
  return [...tags.value].sort((a, b) => a.name.localeCompare(b.name));
});

const sessionOrder = ref<number[]>([]);

watch(isOpen, (open) => {
  if (open) {
    const selectedIds = new Set(selectedTagIds.value);
    const selectedFirst = baseSortedTags.value.filter((t) => selectedIds.has(t.id));
    const others = baseSortedTags.value.filter((t) => !selectedIds.has(t.id));
    sessionOrder.value = [...selectedFirst, ...others].map((t) => t.id);
  }
});

const orderedTags = computed(() => {
  if (isOpen.value && sessionOrder.value.length) {
    const byId = new Map(baseSortedTags.value.map((t) => [t.id, t] as const));
    return sessionOrder.value.map((id) => byId.get(id)!).filter(Boolean);
  }
  return baseSortedTags.value;
});

const displayedTags = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return orderedTags.value;
  return orderedTags.value.filter((t) => t.name.toLowerCase().includes(term));
});

const isTagSelected = (tagId: number) => selectedTagIds.value.includes(tagId);

const pickTag = (tag: TagModel) => {
  const isSelected = isTagSelected(tag.id);
  toggleTag({ tag, checked: !isSelected });
};

const toggleTag = ({ tag, checked }: { tag: TagModel; checked: boolean }) => {
  if (checked) {
    selectedTagIds.value = [...selectedTagIds.value, tag.id];
  } else {
    selectedTagIds.value = selectedTagIds.value.filter((id) => id !== tag.id);
  }

  emit('update:tagIds', selectedTagIds.value);
};

const clearSelection = () => {
  selectedTagIds.value = [];
  emit('update:tagIds', []);
};
</script>
