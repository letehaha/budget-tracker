<script lang="ts" setup>
import * as Popover from '@/components/lib/ui/popover';
import * as ScrollArea from '@/components/lib/ui/scroll-area';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { InfoIcon } from 'lucide-vue-next';
</script>

<template>
  <Popover.Popover>
    <Popover.PopoverTrigger as-child>
      <div class="text-primary inline-flex cursor-pointer items-center gap-1 hover:underline">
        How it works? <InfoIcon :size="16" />
      </div>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent class="w-[500px] overflow-y-auto" side="right">
      <ScrollArea.ScrollArea
        class="[&>[data-radix-scroll-area-viewport]]:max-h-[90dvh]"
        :scroll-area-id="SCROLL_AREA_IDS.txRefundInfo"
      >
        <h3 class="mb-2 text-lg font-bold">About Refund Transactions</h3>

        <p class="text-sm text-white/60">
          This action links the current transaction [expense/income] as a refund to a previous existing transaction.
        </p>

        <h4 class="mb-1 mt-3 font-semibold">How it works:</h4>
        <ul class="list-inside list-disc text-sm text-white/60">
          <li>For an expense refund: Select the original income transaction.</li>
          <li>For an income refund: Select the original expense transaction.</li>
          <li>
            You can mark any transaction as a refund even if there's no "original" transaction in the system. Useful in
            case you don't have account with the original transaction in the system.
          </li>
        </ul>

        <h4 class="mb-1 mt-3 font-semibold">Benefits:</h4>
        <ul class="list-inside list-disc text-sm text-white/60">
          <li>Enhances financial accuracy by adjusting spending or income statistics to exclude refunded amounts.</li>
          <li>Helps track related transactions to improve your feed.</li>
        </ul>

        <h4 class="mb-1 mt-3 font-semibold">Important Notes:</h4>
        <ul class="list-inside list-disc text-sm text-white/60">
          <li>This link is for record-keeping purposes only.</li>
          <li>It does not adjust the balance of the original transaction in any way.</li>
          <li>You can always unlink transactions back.</li>
        </ul>

        <h4 class="mb-1 mt-3 font-semibold">Examples:</h4>
        <ul class="list-inside list-disc text-sm text-white/60">
          <li>Refunding a customer payment: Create an expense and link it to the original income.</li>
          <li>Receiving a refund from a vendor: Create an income and link it to the original expense.</li>
          <li>
            Recording a refund without an original transaction: Sometimes you might need to record a refund for a
            transaction that isn't in your system. For instance, if you're recording a refund for a cash payment that
            wasn't initially logged, you can still create a refund entry. This helps maintain accurate records even when
            the original transaction isn't digitally tracked.
          </li>
        </ul>
      </ScrollArea.ScrollArea>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>
