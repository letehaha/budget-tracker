<template>
  <div class="w-full">
    <FieldLabel :label="label" only-template>
      <PickerContent>
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
      </PickerContent>

      <!-- Desktop: Popover -->
      <template v-if="!isMobile">
        <Popover v-model:open="isOpen">
          <PopoverTrigger as-child>
            <button
              type="button"
              :disabled="disabled"
              :class="
                cn(
                  'border-input bg-input-background ring-offset-background flex min-h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
                  disabled && 'cursor-not-allowed opacity-50',
                )
              "
            >
              <TagsTrigger />
              <ChevronsUpDownIcon class="text-muted-foreground size-4 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-70 p-4" align="start">
            <RenderPickerContent />
          </PopoverContent>
        </Popover>
      </template>

      <!-- Mobile: Drawer -->
      <template v-else>
        <button
          type="button"
          :disabled="disabled"
          :class="
            cn(
              'border-input bg-input-background ring-offset-background flex min-h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
              disabled && 'cursor-not-allowed opacity-50',
            )
          "
          @click="isOpen = true"
        >
          <TagsTrigger />
          <ChevronsUpDownIcon class="text-muted-foreground size-4 shrink-0" />
        </button>

        <Drawer.Drawer v-model:open="isOpen">
          <Drawer.DrawerContent class="px-4 pb-4">
            <Drawer.DrawerHeader class="px-0 pt-2 pb-2 text-center">
              <Drawer.DrawerTitle>{{ $t('fields.tagSelect.title') }}</Drawer.DrawerTitle>
            </Drawer.DrawerHeader>
            <ScrollArea viewport-class="max-h-[60vh]" class="px-1 pt-2 pb-1">
              <RenderPickerContent />
            </ScrollArea>
          </Drawer.DrawerContent>
        </Drawer.Drawer>
      </template>
    </FieldLabel>
    <FieldError :error-message="errorMessage" />
  </div>
</template>

<script setup lang="ts">
import TagIcon from '@/components/common/icons/tag-icon.vue';
import { FieldError, FieldLabel } from '@/components/fields';
import * as Drawer from '@/components/lib/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { cn } from '@/lib/utils';
import { useTagsStore } from '@/stores';
import { TagModel } from '@bt/shared/types';
import { createReusableTemplate } from '@vueuse/core';
import { ChevronsUpDownIcon, XIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref, h } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    label?: string;
    modelValue?: string[];
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
  'update:model-value': [value: string[]];
}>();

const { t } = useI18n();
const tagsStore = useTagsStore();
const { tags } = storeToRefs(tagsStore);
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const isOpen = ref(false);

const availableTags = computed(() => tags.value);

const selectedTagIds = computed(() => new Set(props.modelValue ?? []));

const selectedTags = computed(() => {
  const ids = props.modelValue ?? [];
  return ids.map((id) => tags.value.find((tag) => tag.id === id)).filter((tag): tag is TagModel => tag !== undefined);
});

const placeholder = computed(() => props.placeholder ?? t('fields.tagSelect.placeholder'));

const isSelected = (tagId: string) => selectedTagIds.value.has(tagId);

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

const [PickerContent, RenderPickerContent] = createReusableTemplate();

// Trigger inner content: either placeholder text or the selected-tag chips
// (with click-to-remove on hover). Inlined as a render function so the same
// node tree renders inside both popover and drawer triggers without template
// duplication.
const TagsTrigger = () => {
  if (selectedTags.value.length === 0) {
    return h('div', { class: 'text-muted-foreground flex-1 text-left' }, placeholder.value);
  }

  return h(
    'div',
    { class: 'flex flex-1 flex-wrap gap-1' },
    selectedTags.value.map((tag) =>
      h(
        'span',
        {
          key: tag.id,
          class:
            'group inline-flex cursor-pointer items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white transition-opacity hover:opacity-80',
          style: { backgroundColor: tag.color },
          onClick: (e: MouseEvent) => {
            e.stopPropagation();
            toggleTag(tag);
          },
        },
        [
          h(XIcon, { class: 'absolute hidden size-3 group-hover:block' }),
          h(
            'span',
            { class: 'inline-flex items-center gap-1 group-hover:invisible' },
            [tag.icon ? h(TagIcon, { name: tag.icon, class: 'size-3' }) : null, tag.name].filter(Boolean),
          ),
        ],
      ),
    ),
  );
};
</script>
