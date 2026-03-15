<template>
  <div class="w-full">
    <FieldLabel :label="label" only-template>
      <Popover v-model:open="isOpen">
        <PopoverTrigger as-child>
          <button
            type="button"
            :disabled="disabled"
            :class="
              cn(
                'border-input bg-background ring-offset-background flex min-h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
                disabled && 'cursor-not-allowed opacity-50',
              )
            "
          >
            <div v-if="selectedTags.length === 0" class="text-muted-foreground flex-1 text-left">
              {{ placeholder }}
            </div>
            <div v-else class="flex flex-1 flex-wrap gap-1">
              <span
                v-for="tag in selectedTags"
                :key="tag.id"
                class="group inline-flex cursor-pointer items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white transition-opacity hover:opacity-80"
                :style="{ backgroundColor: tag.color }"
                @click.stop="toggleTag(tag)"
              >
                <XIcon class="absolute hidden size-3 group-hover:block" />
                <span class="inline-flex items-center gap-1 group-hover:invisible">
                  <TagIcon v-if="tag.icon" :name="tag.icon" class="size-3" />
                  {{ tag.name }}
                </span>
              </span>
            </div>
            <ChevronsUpDownIcon class="text-muted-foreground size-4 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent class="w-70 p-4" align="start">
          <div v-if="availableTags.length === 0" class="text-muted-foreground py-4 text-center text-sm">
            {{ $t('fields.tagSelect.noTagsAvailable') }}
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <span
              v-for="tag in availableTags"
              :key="tag.id"
              :class="
                cn(
                  'group responsive inline-flex cursor-pointer items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white transition-opacity',
                  isSelected(tag.id) ? 'opacity-50 hover:opacity-100' : 'hover:opacity-90',
                )
              "
              :style="{ backgroundColor: tag.color }"
              @click="toggleTag(tag)"
            >
              <template v-if="isSelected(tag.id)">
                <XIcon class="absolute hidden size-3 group-hover:block" />
                <span class="inline-flex items-center gap-1 group-hover:invisible">
                  <TagIcon v-if="tag.icon" :name="tag.icon" class="size-3" />
                  {{ tag.name }}
                </span>
              </template>
              <template v-else>
                <TagIcon v-if="tag.icon" :name="tag.icon" class="size-3" />
                {{ tag.name }}
              </template>
            </span>
          </div>
        </PopoverContent>
      </Popover>
    </FieldLabel>
    <FieldError :error-message="errorMessage" />
  </div>
</template>

<script setup lang="ts">
import TagIcon from '@/components/common/icons/tag-icon.vue';
import { FieldError, FieldLabel } from '@/components/fields';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { cn } from '@/lib/utils';
import { useTagsStore } from '@/stores';
import { TagModel } from '@bt/shared/types';
import { ChevronsUpDownIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    label?: string;
    modelValue?: number[];
    placeholder?: string;
    errorMessage?: string;
    disabled?: boolean;
  }>(),
  {
    label: undefined,
    modelValue: () => [],
    placeholder: undefined,
    errorMessage: undefined,
  },
);

const emit = defineEmits<{
  'update:model-value': [value: number[]];
}>();

const { t } = useI18n();
const tagsStore = useTagsStore();
const { tags } = storeToRefs(tagsStore);

const isOpen = ref(false);

const availableTags = computed(() => tags.value);

const selectedTagIds = computed(() => new Set(props.modelValue ?? []));

const selectedTags = computed(() => {
  const ids = props.modelValue ?? [];
  return ids.map((id) => tags.value.find((tag) => tag.id === id)).filter((tag): tag is TagModel => tag !== undefined);
});

const placeholder = computed(() => props.placeholder ?? t('fields.tagSelect.placeholder'));

const isSelected = (tagId: number) => selectedTagIds.value.has(tagId);

const toggleTag = (tag: TagModel) => {
  const currentIds = [...(props.modelValue ?? [])];
  const index = currentIds.indexOf(tag.id);

  if (index === -1) {
    currentIds.push(tag.id);
  } else {
    currentIds.splice(index, 1);
  }

  emit('update:model-value', currentIds);
};
</script>
