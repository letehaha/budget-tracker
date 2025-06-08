<template>
  <InputField
    :model-value="noteIncludes"
    label="Note includes (comma-separated):"
    placeholder="Amazon,nike"
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
});

defineEmits(['update:note-includes']);
</script>
