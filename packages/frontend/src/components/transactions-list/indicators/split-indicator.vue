<template>
  <TooltipProvider v-if="hasSplits" :delay-duration="0">
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          class="flex h-6 items-center gap-0.5 rounded-sm border border-amber-500/60 px-1 py-0.5 text-xs text-amber-400/90"
        >
          <SplitIcon class="size-4" />
          <span>{{ transaction.splits.length + 1 }}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>Split</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>

<script lang="ts" setup>
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/lib/ui/tooltip';
import { TransactionModel } from '@bt/shared/types';
import { SplitIcon } from 'lucide-vue-next';
import { computed } from 'vue';

const props = defineProps<{
  transaction: TransactionModel;
}>();

const hasSplits = computed(() => props.transaction.splits && props.transaction.splits.length > 0);
</script>
