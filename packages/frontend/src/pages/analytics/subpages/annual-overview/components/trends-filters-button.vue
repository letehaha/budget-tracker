<template>
  <div>
    <DesktopOnlyTooltip :content="$t('analytics.trends.filters.button')">
      <span class="inline-flex">
        <ResponsiveMenu v-model:open="isOpen" popover-class="w-80 max-w-none p-3">
          <template #trigger>
            <Button
              variant="secondary"
              size="sm"
              :aria-label="$t('analytics.trends.filters.button')"
              :class="cn('shrink-0 gap-1.5', activeCount > 0 && 'border-primary border')"
            >
              <SlidersHorizontalIcon class="size-4" />
              <span class="hidden @sm/trends:inline">{{ $t('analytics.trends.filters.button') }}</span>
              <span
                v-if="activeCount > 0"
                class="bg-primary text-primary-foreground inline-flex size-4.5 items-center justify-center rounded-full text-[10px] font-medium"
              >
                {{ activeCount }}
              </span>
            </Button>
          </template>

          <TrendsFiltersPanel :filters="filters" @update:filters="emit('update:filters', $event)" />
        </ResponsiveMenu>
      </span>
    </DesktopOnlyTooltip>
  </div>
</template>

<script setup lang="ts">
import ResponsiveMenu from '@/components/common/responsive-menu.vue';
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { cn } from '@/lib/utils';
import { SlidersHorizontalIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

import { type TrendsFilters, countActiveFilters } from '../trends-filters';
import TrendsFiltersPanel from './trends-filters-panel.vue';

const props = defineProps<{
  filters: TrendsFilters;
}>();

const emit = defineEmits<{
  'update:filters': [value: TrendsFilters];
}>();

const isOpen = ref(false);

const activeCount = computed(() => countActiveFilters({ filters: props.filters }));
</script>
