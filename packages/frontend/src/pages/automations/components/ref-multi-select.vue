<script setup lang="ts">
import MultiSelectField from '@/components/fields/multi-select-field.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import type { RecordId } from '@bt/shared/types';
import { computed, ref } from 'vue';

const props = defineProps<{
  modelValue: RecordId[];
  options: { id: RecordId; name: string }[];
  placeholder: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: RecordId[]] }>();

const searchTerm = ref('');

const visibleOptions = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  return term ? props.options.filter((option) => option.name.toLowerCase().includes(term)) : props.options;
});

const selectedLabel = computed(() =>
  props.options
    .filter((option) => props.modelValue.includes(option.id))
    .map((option) => option.name)
    .join(', '),
);

const toggle = ({ id }: { id: RecordId }) =>
  emit(
    'update:modelValue',
    props.modelValue.includes(id) ? props.modelValue.filter((item) => item !== id) : [...props.modelValue, id],
  );
</script>

<template>
  <MultiSelectField
    v-model:search-term="searchTerm"
    :active="modelValue.length > 0"
    :label="placeholder"
    :selected-label="selectedLabel"
    :search-placeholder="$t('fields.select.searchPlaceholder')"
    @clear="emit('update:modelValue', [])"
  >
    <ScrollArea class="max-h-80" viewport-class="max-h-80">
      <div class="p-2">
        <p v-if="!visibleOptions.length" class="text-muted-foreground py-4 text-center text-sm">
          {{ $t('automations.editor.noResults') }}
        </p>

        <div
          v-for="option in visibleOptions"
          :key="option.id"
          role="option"
          :aria-selected="modelValue.includes(option.id)"
          class="hover:bg-accent flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5"
          @click="toggle({ id: option.id })"
        >
          <Checkbox
            :model-value="modelValue.includes(option.id)"
            @click.stop
            @update:model-value="toggle({ id: option.id })"
          />
          <span class="min-w-0 flex-1 truncate text-sm">{{ option.name }}</span>
        </div>
      </div>
    </ScrollArea>
  </MultiSelectField>
</template>
