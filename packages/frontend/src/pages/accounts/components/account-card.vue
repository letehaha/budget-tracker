<template>
  <router-link
    :to="{
      name: ROUTES_NAMES.account,
      params: { id: account.id },
    }"
    class="hover:bg-accent max-xs:justify-between max-xs:items-center max-xs:gap-5 max-xs:py-2 xs:rounded-lg xs:flex-col relative flex h-full gap-3 border p-4 shadow-xs"
  >
    <div class="flex flex-col gap-1 overflow-hidden">
      <div class="flex items-center gap-4 overflow-hidden">
        <template v-if="account.bankProviderType">
          <BankProviderLogo class="size-6 shrink-0" :provider="account.bankProviderType" />
        </template>
        <div class="xs:max-w-[calc(100%-60px)] truncate text-base tracking-wide whitespace-nowrap">
          {{ account.name || $t('accounts.noNameSet') }}
        </div>
      </div>

      <div v-if="isSharedWithMe" class="text-muted-foreground inline-flex items-center gap-1 truncate text-xs">
        <component :is="isHouseholdGranted ? HomeIcon : UsersIcon" class="size-3 shrink-0" />
        <span class="truncate">
          <template v-if="isHouseholdGranted">
            {{ $t('accounts.viaHousehold', { handle: `@${account.share!.owner.username}` }) }}
          </template>
          <template v-else>
            {{ $t('accounts.sharedBy', { handle: `@${account.share!.owner.username}` }) }}
          </template>
        </span>
      </div>
    </div>

    <div class="xs:text-lg font-semibold whitespace-nowrap">
      {{ formatAmountByCurrencyCode(displayBalance, account.currencyCode) }}
    </div>
  </router-link>
</template>

<script setup lang="ts">
import BankProviderLogo from '@/components/common/bank-providers/bank-provider-logo.vue';
import { useFormatCurrency } from '@/composable';
import { useAccountAccess } from '@/composable/use-account-access';
import { useAccountDisplayBalance } from '@/composable/use-account-display-balance';
import { ROUTES_NAMES } from '@/routes/constants';
import { ACCESS_SOURCES, AccountModel } from '@bt/shared/types';
import { HomeIcon, UsersIcon } from 'lucide-vue-next';
import { computed, toRef } from 'vue';

const props = defineProps<{ account: AccountModel }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { displayBalance } = useAccountDisplayBalance({ account: toRef(() => props.account) });

const { isSharedWithCaller: isSharedWithMe } = useAccountAccess(toRef(() => props.account));
const isHouseholdGranted = computed(() => props.account.share?.accessSource === ACCESS_SOURCES.household);
</script>
