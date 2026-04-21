<template>
  <ComboboxCategories :category-ids="categoryIds" @update:category-ids="emit('update:categoryIds', $event)" />
</template>

<script setup lang="ts">
import ComboboxCategories from '@/components/common/combobox-categories.vue';

defineProps<{
  categoryIds: number[];
}>();

const emit = defineEmits<{
  'update:categoryIds': [value: number[]];
}>();
</script>
