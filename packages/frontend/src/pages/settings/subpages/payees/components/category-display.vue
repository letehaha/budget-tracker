<template>
  <span v-if="category" class="flex min-w-0 items-center gap-1.5">
    <CategoryCircle :category="category" class="size-5 shrink-0" />
    <span class="truncate text-sm">{{ category.name }}</span>
  </span>
  <span v-else class="text-muted-foreground text-sm">—</span>
</template>

<script setup lang="ts">
import CategoryCircle from '@/components/common/category-circle.vue';
import { useCategoriesStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const props = defineProps<{
  categoryId: string | null;
}>();

const { categoriesMap } = storeToRefs(useCategoriesStore());

const category = computed(() => (props.categoryId ? (categoriesMap.value?.[props.categoryId] ?? null) : null));
</script>
