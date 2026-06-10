<template>
  <InputField
    :model-value="noteIncludes"
    :label="compact ? undefined : $t('transactions.filters.noteIncludes.label')"
    :placeholder="
      compact
        ? $t('transactions.filters.noteIncludes.compactPlaceholder')
        : $t('transactions.filters.noteIncludes.placeholder')
    "
    @update:model-value="$emit('update:note-includes', $event)"
  />
</template>

<script lang="ts" setup>
import InputField from '@/components/fields/input-field.vue';

defineProps({
  noteIncludes: {
    type: String,
    default: null,
  },
  /** Label-less variant for the inline filters toolbar; the placeholder carries the meaning instead. */
  compact: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['update:note-includes']);
</script>
