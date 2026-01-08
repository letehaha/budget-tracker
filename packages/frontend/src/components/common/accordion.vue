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
          <div
            :class="
              cn([
                'flex flex-1 items-center justify-start gap-2 overflow-hidden rounded-md px-3 py-2 text-sm font-medium',
                isInternalCategory(cat)
                  ? 'cursor-default opacity-70'
                  : 'hover:bg-accent hover:text-accent-foreground cursor-pointer',
              ])
            "
            @click="!isInternalCategory(cat) && handleCategoryClick(cat)"
          >
            <ChevronRightIcon
              class="text-muted-foreground size-4 shrink-0 transition-transform duration-200"
              :class="[
                cat.subCategories.length ? { 'rotate-90': props.expandedCategories.includes(cat.id) } : 'opacity-30',
              ]"
            />

            <CategoryCircle :category="cat" />
            <span class="truncate">{{ cat.name }}</span>
            <span v-if="isInternalCategory(cat)" class="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-xs">
              {{ t('common.labels.system') }}
            </span>
          </div>

          <ResponsiveMenu v-if="showActions && !isInternalCategory(cat)" v-model:open="menuOpenState[cat.id]">
            <template #trigger>
              <Button variant="ghost" size="icon-sm" class="size-8 shrink-0" title="Actions" @click.stop>
                <MoreVerticalIcon class="size-4" />
              </Button>
            </template>

            <template #default="{ close }">
              <Button variant="ghost" class="w-full justify-start gap-2" size="sm" @click="handleEdit(cat, close)">
                <PencilIcon class="size-4" />
                {{ t('common.actions.edit') }}
              </Button>

              <Button
                v-if="canAddSubcategory"
                variant="ghost"
                class="w-full justify-start gap-2"
                size="sm"
                @click="handleAddSubcategory(cat, close)"
              >
                <PlusIcon class="size-4 shrink-0" />
                {{ t('common.actions.addSubcategory') }}
              </Button>

              <div class="bg-border my-1 h-px" />

              <Button
                variant="ghost"
                class="text-destructive-text hover:text-destructive-text w-full justify-start gap-2"
                size="sm"
                @click="handleDelete(cat, close)"
              >
                <Trash2Icon class="size-4" />
                {{ t('common.actions.delete') }}
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
            @toggle="(c) => emits('toggle', c)"
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
import { CATEGORY_TYPES } from '@bt/shared/types';
import { ChevronRightIcon, MoreVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const isInternalCategory = (category: FormattedCategory) => category.type === CATEGORY_TYPES.internal;

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

const handleCategoryClick = (category: FormattedCategory) => {
  if (category.subCategories.length) {
    emits('toggle', category);
  } else if (props.showActions) {
    menuOpenState[category.id] = true;
  }
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
