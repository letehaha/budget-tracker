<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useFormatCurrency } from '@/composable';
import { useAccountAccess } from '@/composable/use-account-access';
import { useAccountDisplayBalance } from '@/composable/use-account-display-balance';
import { ROUTES_NAMES } from '@/routes/constants';
import { ACCESS_SOURCES, AccountModel } from '@bt/shared/types';
import { HomeIcon, UsersIcon } from 'lucide-vue-next';
import { computed, toRef } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const { formatCompactAmount, formatAmountByCurrencyCode } = useFormatCurrency();
const { displayBalance } = useAccountDisplayBalance({ account: toRef(() => props.account) });

const { isSharedWithCaller, ownerHandle } = useAccountAccess(toRef(() => props.account));
const isHouseholdGranted = computed(() => props.account.share?.accessSource === ACCESS_SOURCES.household);
</script>

<template>
  <router-link
    v-slot="{ isActive }"
    :to="{ name: ROUTES_NAMES.account, params: { id: account.id } }"
    class="flex w-full"
  >
    <Button :variant="isActive ? 'secondary' : 'ghost'" as="div" size="default" class="h-auto w-full px-2">
      <div class="flex w-full items-center justify-between gap-x-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <DesktopOnlyTooltip
            v-if="isSharedWithCaller"
            :content="
              isHouseholdGranted
                ? $t('sidebar.accountsView.viaHousehold', { handle: `@${ownerHandle}` })
                : $t('sidebar.accountsView.sharedBy', { handle: `@${ownerHandle}` })
            "
          >
            <component
              :is="isHouseholdGranted ? HomeIcon : UsersIcon"
              class="text-muted-foreground size-3.5 shrink-0"
            />
          </DesktopOnlyTooltip>
          <span class="truncate text-sm">{{ account.name }}</span>
        </div>
        <DesktopOnlyTooltip :content="formatAmountByCurrencyCode(displayBalance, account.currencyCode)">
          <span
            class="text-amount shrink-0 text-sm"
            :class="displayBalance >= 0 ? 'text-muted-foreground' : 'text-destructive-text'"
          >
            {{ formatCompactAmount(displayBalance, account.currencyCode) }}
          </span>
        </DesktopOnlyTooltip>
      </div>
    </Button>
  </router-link>
</template>
