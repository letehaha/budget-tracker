<template>
  <Popover.Popover>
    <Popover.PopoverTrigger class="px-1" as-child>
      <Button size="icon-sm" variant="ghost">
        <CircleOffIcon class="text-warning size-4" />
      </Button>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent class="max-w-75 text-sm">
      <div>
        <p>
          {{ $t('dashboard.widgets.expensesStructure.excludedCategories.message') }}
          <router-link to="/settings/categories" class="text-primary hover:underline" as="span">
            {{ $t('dashboard.widgets.expensesStructure.excludedCategories.updateSettings') }}
          </router-link>
          {{ $t('dashboard.widgets.expensesStructure.excludedCategories.changeBehavior') }}
        </p>
        <div class="mt-3 grid gap-2">
          <template v-for="categoryId of categoryIds" :key="categoryId">
            <div class="flex items-center gap-2">
              <CategoryCircle :category="categoriesMap[categoryId]" />

              {{ categoriesMap[categoryId]?.name }}
            </div>
          </template>
        </div>
      </div>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>

<script lang="ts" setup>
import CategoryCircle from '@/components/common/category-circle.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { useCategoriesStore } from '@/stores';
import { CircleOffIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';

defineProps<{
  categoryIds: number[];
}>();

const categoriesStore = useCategoriesStore();
const { categoriesMap } = storeToRefs(categoriesStore);
</script>
