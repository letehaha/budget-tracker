<script lang="ts" setup>
import * as Popover from '@/components/lib/ui/popover';
import * as ScrollArea from '@/components/lib/ui/scroll-area';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { InfoIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <Popover.Popover>
    <Popover.PopoverTrigger as-child>
      <div class="text-primary inline-flex cursor-pointer items-center gap-1 hover:underline">
        {{ t('dialogs.manageTransaction.refundInfo.trigger') }} <InfoIcon :size="16" />
      </div>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent class="w-125 overflow-y-auto" side="right">
      <ScrollArea.ScrollArea
        class="*:data-reka-scroll-area-viewport:max-h-[90dvh]"
        :scroll-area-id="SCROLL_AREA_IDS.txRefundInfo"
      >
        <h3 class="mb-2 text-lg font-bold">{{ t('dialogs.manageTransaction.refundInfo.title') }}</h3>

        <p class="text-sm text-white/60">
          {{ t('dialogs.manageTransaction.refundInfo.description') }}
        </p>

        <h4 class="mt-3 mb-1 font-semibold">{{ t('dialogs.manageTransaction.refundInfo.howItWorks.title') }}</h4>
        <ul class="list-inside list-disc text-sm text-white/60">
          <li>{{ t('dialogs.manageTransaction.refundInfo.howItWorks.expenseRefund') }}</li>
          <li>{{ t('dialogs.manageTransaction.refundInfo.howItWorks.incomeRefund') }}</li>
          <li>{{ t('dialogs.manageTransaction.refundInfo.howItWorks.noOriginal') }}</li>
        </ul>

        <h4 class="mt-3 mb-1 font-semibold">{{ t('dialogs.manageTransaction.refundInfo.benefits.title') }}</h4>
        <ul class="list-inside list-disc text-sm text-white/60">
          <li>{{ t('dialogs.manageTransaction.refundInfo.benefits.accuracy') }}</li>
          <li>{{ t('dialogs.manageTransaction.refundInfo.benefits.tracking') }}</li>
        </ul>

        <h4 class="mt-3 mb-1 font-semibold">{{ t('dialogs.manageTransaction.refundInfo.notes.title') }}</h4>
        <ul class="list-inside list-disc text-sm text-white/60">
          <li>{{ t('dialogs.manageTransaction.refundInfo.notes.recordKeeping') }}</li>
          <li>{{ t('dialogs.manageTransaction.refundInfo.notes.noBalanceAdjust') }}</li>
          <li>{{ t('dialogs.manageTransaction.refundInfo.notes.canUnlink') }}</li>
        </ul>

        <h4 class="mt-3 mb-1 font-semibold">{{ t('dialogs.manageTransaction.refundInfo.examples.title') }}</h4>
        <ul class="list-inside list-disc text-sm text-white/60">
          <li>{{ t('dialogs.manageTransaction.refundInfo.examples.customerPayment') }}</li>
          <li>{{ t('dialogs.manageTransaction.refundInfo.examples.vendorRefund') }}</li>
          <li>{{ t('dialogs.manageTransaction.refundInfo.examples.noOriginalTx') }}</li>
        </ul>
      </ScrollArea.ScrollArea>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>
