<template>
  <div>
    <template v-for="cat in categories" :key="cat.id">
      <div>
        <div
          :class="
            cn([
              '-ml-4 flex w-[calc(100%+32px)] items-center gap-1 rounded-md py-0.5',
              {
                'bg-accent': isActiveCategory(cat),
              },
            ])
          "
        >
          <Button
            class="flex flex-1 items-center justify-start gap-2 overflow-hidden"
            variant="ghost"
            size="sm"
            @click="toggleCategory(cat)"
          >
            <ChevronRightIcon
              v-if="cat.subCategories.length"
              class="text-muted-foreground size-4 shrink-0 transition-transform duration-200"
              :class="{ 'rotate-90': props.expandedCategories.includes(cat.id) }"
            />
            <span v-else class="w-4" />

            <CategoryCircle :category="cat" />
            <span class="truncate">{{ cat.name }}</span>
          </Button>

          <ResponsiveMenu v-if="showActions" v-model:open="menuOpenState[cat.id]">
            <template #trigger>
              <Button variant="ghost" size="icon-sm" class="size-8 shrink-0" title="Actions" @click.stop>
                <MoreVerticalIcon class="size-4" />
              </Button>
            </template>

            <template #default="{ close }">
              <Button variant="ghost" class="w-full justify-start gap-2" size="sm" @click="handleEdit(cat, close)">
                <PencilIcon class="size-4" />
                Edit
              </Button>

              <Button
                v-if="canAddSubcategory"
                variant="ghost"
                class="w-full justify-start gap-2"
                size="sm"
                @click="handleAddSubcategory(cat, close)"
              >
                <PlusIcon class="size-4" />
                Add subcategory
              </Button>

              <div class="bg-border my-1 h-px" />

              <Button
                variant="ghost"
                class="text-destructive-text hover:text-destructive-text w-full justify-start gap-2"
                size="sm"
                @click="handleDelete(cat, close)"
              >
                <Trash2Icon class="size-4" />
                Delete
              </Button>
            </template>
          </ResponsiveMenu>
        </div>

        <div
          v-if="props.expandedCategories.includes(cat.id) && cat.subCategories && cat.subCategories.length"
          class="ml-6 border-l pl-4"
        >
          <Accordion
            v-if="cat.subCategories.length"
            :categories="cat.subCategories"
            :expanded-categories="props.expandedCategories"
            :max-level="maxLevel"
            :current-level="currentLevel + 1"
            :active-category-id="activeCategoryId"
            :show-actions="showActions"
            @toggle="toggleCategory"
            @select="selectCategory"
            @edit="(c) => emits('edit', c)"
            @add-subcategory="(c) => emits('add-subcategory', c)"
            @delete="(c) => emits('delete', c)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { FormattedCategory } from '@/common/types';
import CategoryCircle from '@/components/common/category-circle.vue';
import ResponsiveMenu from '@/components/common/responsive-menu.vue';
import { Button } from '@/components/lib/ui/button';
import { cn } from '@/lib/utils';
import { ChevronRightIcon, MoreVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next';
import { computed, reactive } from 'vue';

const props = withDefaults(
  defineProps<{
    categories: FormattedCategory[];
    expandedCategories: number[];
    maxLevel: number;
    currentLevel: number;
    activeCategoryId: number | null | undefined;
    showActions?: boolean;
  }>(),
  {
    showActions: false,
  },
);

const emits = defineEmits<{
  toggle: [category: FormattedCategory];
  select: [category: FormattedCategory];
  edit: [category: FormattedCategory];
  'add-subcategory': [category: FormattedCategory];
  delete: [category: FormattedCategory];
}>();

const menuOpenState = reactive<Record<number, boolean>>({});

const canAddSubcategory = computed(() => props.currentLevel < props.maxLevel);

const toggleCategory = (category: FormattedCategory) => {
  emits('toggle', category);
};

const isActiveCategory = (category: FormattedCategory) => category.id === props.activeCategoryId;

const selectCategory = (category: FormattedCategory) => {
  emits('select', category);
};

const handleEdit = (category: FormattedCategory, close: () => void) => {
  close();
  emits('edit', category);
};

const handleAddSubcategory = (category: FormattedCategory, close: () => void) => {
  close();
  emits('add-subcategory', category);
};

const handleDelete = (category: FormattedCategory, close: () => void) => {
  close();
  emits('delete', category);
};
</script>
