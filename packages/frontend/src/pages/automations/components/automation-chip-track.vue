<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { cn } from '@/lib/utils';
import { computed, ref } from 'vue';

import AutomationChip from './automation-chip.vue';
import type { AutomationChip as Chip, AutomationDensity } from './automation-chips';

const MAX_VISIBLE_CHIPS = 3;

const props = defineProps<{
  chips: Chip[];
  variant: 'when' | 'then';
  density: AutomationDensity;
  match?: 'all' | 'any';
}>();

const isExpanded = ref(false);

const visibleChips = computed(() => (isExpanded.value ? props.chips : props.chips.slice(0, MAX_VISIBLE_CHIPS)));
const hiddenChips = computed(() => props.chips.slice(MAX_VISIBLE_CHIPS));

const showsConjunction = computed(() => props.variant === 'when' && props.match === 'any');

const trackClass = computed(() =>
  cn(
    'flex min-w-0 items-center',
    props.density === 'compact' ? 'flex-nowrap gap-1 overflow-hidden' : 'flex-wrap gap-1.5',
  ),
);

const overflowClass = computed(() =>
  cn('h-6 shrink-0 border-dashed px-2 text-xs', props.variant === 'then' && 'border-primary/40 text-primary-text'),
);
</script>

<template>
  <div :class="trackClass">
    <template v-for="(chip, index) in visibleChips" :key="index">
      <span
        v-if="showsConjunction && index > 0"
        class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase"
      >
        {{ $t('automations.editor.matchAny') }}
      </span>
      <AutomationChip :chip="chip" :variant="variant" :density="density" />
    </template>

    <template v-if="hiddenChips.length">
      <Popover v-if="density === 'compact'">
        <PopoverTrigger as-child>
          <Button variant="outline" size="sm" :class="overflowClass" @click.stop>
            {{ $t('automations.chips.more', { count: hiddenChips.length }) }}
          </Button>
        </PopoverTrigger>
        <PopoverContent class="flex w-auto max-w-64 flex-wrap gap-1.5 p-2" @click.stop>
          <AutomationChip
            v-for="(chip, index) in hiddenChips"
            :key="index"
            :chip="chip"
            :variant="variant"
            density="comfortable"
          />
        </PopoverContent>
      </Popover>

      <Button v-else variant="outline" size="sm" :class="overflowClass" @click.stop="isExpanded = !isExpanded">
        {{ isExpanded ? $t('automations.chips.less') : $t('automations.chips.more', { count: hiddenChips.length }) }}
      </Button>
    </template>
  </div>
</template>
