<template>
  <TooltipProvider v-if="isRefund" :delay-duration="0">
    <Tooltip>
      <TooltipTrigger as-child>
        <div class="border-primary text-primary flex size-6 items-center gap-0.5 rounded-sm border px-1 py-0.5 text-xs">
          <RotateCcwIcon class="size-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent>Refund</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>

<script lang="ts" setup>
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/lib/ui/tooltip';
import { TransactionModel } from '@bt/shared/types';
import { RotateCcwIcon } from 'lucide-vue-next';
import { computed } from 'vue';

const props = defineProps<{
  transaction: TransactionModel;
}>();

const isRefund = computed(() => props.transaction.refundLinked);
</script>
