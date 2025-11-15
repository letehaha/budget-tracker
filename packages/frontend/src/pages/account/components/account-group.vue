<script setup lang="ts">
import LinkAccountGroup from '@/components/dialogs/account-groups/link-account-group-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Tooltip from '@/components/lib/ui/tooltip';
import { useAccountGroupForAccount } from '@/composable/data-queries/account-groups';
import { AccountModel } from '@bt/shared/types';
import { EditIcon, InfoIcon } from 'lucide-vue-next';
import { ref, watch } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const accId = ref<number | string>(props.account.id);

const { group: accountGroupData } = useAccountGroupForAccount(accId);

watch(
  () => props.account.id,
  (newAccountId) => {
    accId.value = newAccountId;
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex items-center justify-between gap-2">
    <p class="flex items-center gap-2">
      Account group

      <Tooltip.TooltipProvider>
        <Tooltip.Tooltip>
          <Tooltip.TooltipTrigger>
            <InfoIcon class="text-primary size-4" />
          </Tooltip.TooltipTrigger>
          <Tooltip.TooltipContent class="max-w-[400px] p-4">
            <span class="text-sm leading-6 opacity-90">
              Group multiple accounts together to keep your dashboard sidebar organized
            </span>
          </Tooltip.TooltipContent>
        </Tooltip.Tooltip>
      </Tooltip.TooltipProvider>
    </p>

    <div class="flex items-center gap-2">
      <template v-if="accountGroupData">
        {{ accountGroupData.name }}
      </template>
      <template v-else>
        <span> Not associated </span>
      </template>
      <LinkAccountGroup :account="account">
        <UiButton size="icon" variant="secondary">
          <span class="flex items-center gap-3">
            <EditIcon class="size-5" />
          </span>
        </UiButton>
      </LinkAccountGroup>
    </div>
  </div>
</template>
