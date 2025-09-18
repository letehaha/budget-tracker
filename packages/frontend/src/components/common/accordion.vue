<template>
  <div>
    <template v-for="cat in categories" :key="cat.id">
      <div>
        <Button
          :class="[
            '-ml-4 grid w-[calc(100%+32px)] grid-cols-[1fr_min-content] gap-8',
            { 'bg-accent': isActiveCategory(cat) },
          ]"
          variant="ghost"
          @click="toggleCategory(cat)"
        >
          <div class="flex items-center gap-2">
            <CategoryCircle :category="cat" />
            {{ cat.name }}
          </div>
          <span v-if="cat.subCategories.length" class="flex w-max gap-2 text-sm opacity-70">
            <span>{{ props.expandedCategories.includes(cat.id) ? '↓' : '→' }}</span>
          </span>
        </Button>

        <div
          v-if="props.expandedCategories.includes(cat.id) && cat.subCategories && cat.subCategories.length"
          class="ml-6 mt-2 border-l pl-4"
        >
          <Accordion
            v-if="cat.subCategories.length"
            :categories="cat.subCategories"
            :expanded-categories="props.expandedCategories"
            :max-level="maxLevel"
            :current-level="currentLevel + 1"
            :active-category-id="activeCategoryId"
            @toggle="toggleCategory"
            @select="selectCategory"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { FormattedCategory } from '@/common/types';
import CategoryCircle from '@/components/common/category-circle.vue';
import { Button } from '@/components/lib/ui/button';
import { defineEmits, defineProps } from 'vue';

const props = defineProps<{
  categories: FormattedCategory[];
  expandedCategories: number[];
  maxLevel: number;
  currentLevel: number;
  activeCategoryId: number | null | undefined;
}>();

const emits = defineEmits(['toggle', 'select']);

const toggleCategory = (category: FormattedCategory) => {
  emits('toggle', category);
};

const isActiveCategory = (category: FormattedCategory) => category.id === props.activeCategoryId;

const selectCategory = (category: FormattedCategory) => {
  emits('select', category);
};
</script>
