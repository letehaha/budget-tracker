<template>
  <div>
    <div
      :class="
        cn(
          'flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 transition-colors',
          'hover:bg-accent',
          isSelected(category.id) && 'bg-accent/50',
        )
      "
      :style="{ paddingLeft: `${8 + depth * 16}px` }"
      @click="$emit('toggle', category.id)"
    >
      <Checkbox :model-value="isSelected(category.id)" @click.stop @update:model-value="$emit('toggle', category.id)" />
      <CategoryCircle :category="category" class="shrink-0" />
      <span class="flex-1 truncate text-sm">{{ category.name }}</span>
      <span v-if="descendantCount > 0" class="text-muted-foreground text-xs">
        {{ descendantCount }}
      </span>
    </div>
    <template v-if="category.subCategories?.length && !isSearching">
      <CategoryMultiSelectItem
        v-for="subCategory in category.subCategories"
        :key="subCategory.id"
        :category="subCategory"
        :depth="depth + 1"
        :is-searching="isSearching"
        :is-selected="isSelected"
        :get-descendant-count="getDescendantCount"
        @toggle="$emit('toggle', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { type FormattedCategory } from '@/common/types';
import CategoryCircle from '@/components/common/category-circle.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { cn } from '@/lib/utils';
import { computed } from 'vue';

const props = defineProps<{
  category: FormattedCategory;
  depth: number;
  isSearching: boolean;
  isSelected: (id: number) => boolean;
  getDescendantCount: (category: FormattedCategory) => number;
}>();

defineEmits<{
  toggle: [categoryId: number];
}>();

const descendantCount = computed(() => props.getDescendantCount(props.category));
</script>
