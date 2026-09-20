<template>
  <TooltipProvider v-if="isRefund" :delay-duration="0">
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          class="border-primary text-primary-text flex size-5 shrink-0 items-center justify-center rounded-sm border"
        >
          <RotateCcwIcon class="size-3" />
        </div>
      </TooltipTrigger>
      <TooltipContent>{{ t('common.ui.refund') }}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>

<script lang="ts" setup>
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/lib/ui/tooltip';
import { TransactionModel } from '@bt/shared/types';
import { RotateCcwIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  transaction: TransactionModel;
}>();

const isRefund = computed(() => props.transaction.refundLinked);
</script>
