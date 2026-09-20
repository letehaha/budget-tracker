<template>
  <ResponsiveTooltip
    v-if="transaction.hasAttachments"
    :content="$t('common.transactions.record.attachmentsTooltip')"
    :delay-duration="100"
  >
    <PaperclipIcon
      class="text-muted-foreground size-3.5 shrink-0"
      :aria-label="$t('common.transactions.record.attachmentsTooltip')"
    />
  </ResponsiveTooltip>
</template>

<script lang="ts" setup>
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { TransactionModel } from '@bt/shared/types';
import { PaperclipIcon } from '@lucide/vue';

defineProps<{
  transaction: TransactionModel;
}>();
</script>
