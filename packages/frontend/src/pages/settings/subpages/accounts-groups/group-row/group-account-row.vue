<script setup lang="ts">
import AccountLogo from '@/components/common/account-logo.vue';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useFormatCurrency } from '@/composable';
import { useUnlinkAccountFromGroup } from '@/composable/data-queries/account-groups';
import { useAccountDisplayBalance } from '@/composable/use-account-display-balance';
import { ROUTES_NAMES } from '@/routes/constants';
import { AccountModel } from '@bt/shared/types';
import { UngroupIcon } from '@lucide/vue';
import { ref, toRef } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps<{ account: AccountModel; groupId: string }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();

const { displayBalance } = useAccountDisplayBalance({ account: toRef(() => props.account) });

const isConfirmOpen = ref(false);

const { mutate: unlink, isPending } = useUnlinkAccountFromGroup({
  onSuccess: () => {
    isConfirmOpen.value = false;
  },
});
</script>

<template>
  <div class="flex items-center gap-3 px-3 py-2">
    <AccountLogo :account="account" class="size-8" />

    <RouterLink
      :to="{ name: ROUTES_NAMES.account, params: { id: account.id } }"
      class="focus-visible:ring-ring/40 min-w-0 flex-1 truncate rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
    >
      {{ account.name }}
    </RouterLink>

    <span class="text-muted-foreground shrink-0 text-sm tabular-nums">
      {{ formatAmountByCurrencyCode(displayBalance, account.currencyCode) }}
    </span>

    <DesktopOnlyTooltip :content="$t('settings.accountGroups.accounts.unlinkTooltip')">
      <Button
        variant="ghost-destructive"
        size="icon-sm"
        :disabled="isPending"
        :aria-label="$t('settings.accountGroups.accounts.unlinkTooltip')"
        @click="isConfirmOpen = true"
      >
        <UngroupIcon class="size-4" />
      </Button>
    </DesktopOnlyTooltip>

    <ResponsiveAlertDialog
      v-model:open="isConfirmOpen"
      :confirm-label="$t('settings.accountGroups.accounts.removeConfirmAction')"
      confirm-variant="destructive"
      :confirm-disabled="isPending"
      @confirm="unlink({ accountId: account.id, groupId })"
    >
      <template #title>
        {{ $t('settings.accountGroups.accounts.removeConfirmTitle', { name: account.name }) }}
      </template>

      <template #description>
        {{ $t('settings.accountGroups.accounts.removeConfirmDescription') }}
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>
