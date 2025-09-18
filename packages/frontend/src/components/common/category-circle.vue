<template>
  <template v-if="categoryColor">
    <div
      class="size-5 flex-shrink-0 rounded-full"
      :style="{
        backgroundColor: category.color,
      }"
    />
  </template>
</template>

<script setup lang="ts">
import { useCategoriesStore } from '@/stores';
import { CategoryModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const props = defineProps<{
  category?: CategoryModel;
  categoryId?: number;
}>();

const { categoriesMap } = storeToRefs(useCategoriesStore());

const categoryColor = computed(() => {
  if (props.category) return props.category.color;
  if (props.categoryId) return categoriesMap.value[props.categoryId]?.color;
  return null;
});
</script>
