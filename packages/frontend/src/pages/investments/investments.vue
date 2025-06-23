<template>
  <div class="p-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <h1 class="text-2xl tracking-wider">Investments</h1>

      <router-link :to="{ name: ROUTES_NAMES.createAccount, query: { category: ACCOUNT_CATEGORIES.investment } }">
        <UiButton>Create Investment Account</UiButton>
      </router-link>
    </div>

    <template v-if="investmentAccounts.length">
      <div class="mb-6 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        <template v-for="account in investmentAccounts" :key="account.id">
          <Card :class="cn('relative', !account.isEnabled && 'opacity-40')">
            <router-link
              :to="{
                name: ROUTES_NAMES.investmentAccount,
                params: { accountId: account.id },
              }"
              class="block h-full"
            >
              <CardHeader class="p-3">
                <div
                  v-if="!account.isEnabled"
                  :class="['bg-background absolute right-0 top-0 rounded-tr-md p-1 text-xs leading-none']"
                >
                  Hidden
                </div>
                <div class="mb-2.5 max-w-[calc(100%-60px)] overflow-hidden text-ellipsis text-lg tracking-wide">
                  {{ account.name || 'Investment Account' }}
                </div>
              </CardHeader>
              <CardContent class="px-3 pb-3">
                <div class="flex flex-col gap-1">
                  <div class="investments__item-balance">
                    {{ formatBalance(account) }}
                  </div>
                  <div class="text-muted-foreground text-sm">Investment Account</div>
                </div>
              </CardContent>
            </router-link>
          </Card>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="py-12 text-center">
        <div class="mb-4">
          <svg class="text-muted-foreground mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h3 class="text-foreground mb-2 text-lg font-medium">No Investment Accounts</h3>
        <p class="text-muted-foreground mb-4">
          You don't have any investment accounts yet. Create an investment account from the accounts page to start
          tracking your portfolio.
        </p>
        <router-link :to="{ name: ROUTES_NAMES.accounts }">
          <UiButton>Go to Accounts</UiButton>
        </router-link>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable';
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_CATEGORIES, AccountModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const { accounts } = storeToRefs(useAccountsStore());
const { formatAmountByCurrencyId } = useFormatCurrency();

// Filter for investment accounts only
const investmentAccounts = computed(() =>
  accounts.value
    .filter((account) => account.accountCategory === ACCOUNT_CATEGORIES.investment)
    .sort((a, b) => +b.isEnabled - +a.isEnabled),
);

const formatBalance = (account: AccountModel) =>
  formatAmountByCurrencyId(account.currentBalance - account.creditLimit, account.currencyId);
</script>
