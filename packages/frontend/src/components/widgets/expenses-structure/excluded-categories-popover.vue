<template>
  <Popover.Popover>
    <Popover.PopoverTrigger class="px-1" as-child>
      <Button size="icon-sm" variant="ghost" data-testid="es-excluded-warning">
        <CircleOffIcon class="text-warning size-4" />
      </Button>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent class="max-w-75 text-sm" data-testid="es-excluded-popover">
      <div>
        <p class="text-muted-foreground">
          {{ $t('dashboard.widgets.expensesStructure.excludedCategories.message') }}
        </p>
        <div class="mt-3 grid max-h-40 overflow-auto">
          <template v-for="categoryId of categoryIds" :key="categoryId">
            <div class="flex items-center gap-2">
              <CategoryCircle :category="categoriesMap[categoryId]" />

              <span class="flex-1 truncate">{{ categoriesMap[categoryId]?.name }}</span>

              <Button type="button" size="icon-sm" variant="ghost-destructive" @click="emit('remove', { categoryId })">
                <XIcon class="size-3.5" />
              </Button>
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
import { CircleOffIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';

defineProps<{
  categoryIds: number[];
}>();

const emit = defineEmits<{
  remove: [payload: { categoryId: number }];
}>();

const categoriesStore = useCategoriesStore();
const { categoriesMap } = storeToRefs(categoriesStore);
</script>
