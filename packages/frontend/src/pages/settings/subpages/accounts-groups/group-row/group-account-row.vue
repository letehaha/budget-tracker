<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useFormatCurrency } from '@/composable';
import { useUnlinkAccountFromGroup } from '@/composable/data-queries/account-groups';
import { useAccountDisplayBalance } from '@/composable/use-account-display-balance';
import { cn } from '@/lib/utils';
import { getAccountTypeIcon, getAccountTypeTintedChipClass } from '@/pages/accounts/account-type-presentation';
import { ROUTES_NAMES } from '@/routes/constants';
import { AccountModel } from '@bt/shared/types';
import { UngroupIcon } from '@lucide/vue';
import { computed, toRef } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps<{ account: AccountModel; groupId: string }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();

const { displayBalance } = useAccountDisplayBalance({ account: toRef(() => props.account) });

const chipClass = computed(() => getAccountTypeTintedChipClass({ category: props.account.accountCategory }));
const iconComponent = computed(() => getAccountTypeIcon({ category: props.account.accountCategory }));

const { mutate: unlink, isPending } = useUnlinkAccountFromGroup();
</script>

<template>
  <div class="flex items-center gap-3 px-3 py-2">
    <div :class="cn('flex size-8 shrink-0 items-center justify-center rounded-lg', chipClass)" aria-hidden="true">
      <component :is="iconComponent" class="size-4" stroke-width="2" />
    </div>

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
        @click="unlink({ accountId: account.id, groupId })"
      >
        <UngroupIcon class="size-4" />
      </Button>
    </DesktopOnlyTooltip>
  </div>
</template>
