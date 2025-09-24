<template>
  <div class="p-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <h1 class="text-2xl tracking-wider">Accounts</h1>

      <div class="flex flex-wrap gap-x-4 gap-y-2">
        <router-link :to="{ name: ROUTES_NAMES.createAccount }">
          <UiButton as="span"> Create account </UiButton>
        </router-link>

        <template v-if="!isPaired">
          <MonobankSetToken>
            <UiButton data-cy="pair-monobank-account" type="button" variant="outline"> Pair Monobank account </UiButton>
          </MonobankSetToken>
        </template>
        <template v-else-if="isPaired && isTokenPresent">
          <UiButton type="button" variant="outline" @click="refreshMonoAccounts"> Refresh Monobank balances </UiButton>
        </template>
        <template v-else-if="isPaired && !isTokenPresent">
          <MonobankSetToken is-update>
            <UiButton data-cy="pair-monobank-account" type="button" variant="outline"> Update Monobank token </UiButton>
          </MonobankSetToken>
        </template>
      </div>
    </div>

    <template v-if="formattedAccounts.length">
      <div class="mb-6 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        <template v-for="account in formattedAccounts" :key="account.id">
          <Card :class="cn('relative', !account.isEnabled && 'opacity-40')">
            <router-link
              :to="{
                name: ROUTES_NAMES.account,
                params: { id: account.id },
              }"
              class="block h-full"
            >
              <CardHeader class="p-3">
                <div
                  v-if="!account.isEnabled"
                  :class="['bg-background absolute top-0 right-0 rounded-tr-md p-1 text-xs leading-none']"
                >
                  Hidden
                </div>
                <div class="mb-2.5 max-w-[calc(100%-60px)] overflow-hidden text-lg tracking-wide text-ellipsis">
                  {{ account.name || 'No name set...' }}
                </div>
              </CardHeader>
              <CardContent class="px-3 pb-3">
                <div class="accounts__item-balance">
                  {{ formatBalance(account) }}
                </div>
              </CardContent>
            </router-link>
          </Card>
        </template>
      </div>
    </template>

    <template v-else>
      <p class="mb-6">System accounts do not exist.</p>
    </template>
  </div>
</template>

<script lang="ts" setup>
import MonobankSetToken from '@/components/dialogs/monobank-set-token.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable';
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore, useBanksMonobankStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const monobankStore = useBanksMonobankStore();
const { accounts } = storeToRefs(useAccountsStore());
const { isMonoAccountPaired: isPaired, isTokenPresent } = storeToRefs(monobankStore);

const { formatAmountByCurrencyCode } = useFormatCurrency();

const refreshMonoAccounts = () => {
  monobankStore.refreshAccounts();
};

const formattedAccounts = computed(() => [...accounts.value].sort((a, b) => +b.isEnabled - +a.isEnabled));

const formatBalance = (account: AccountModel) =>
  formatAmountByCurrencyCode(account.currentBalance - account.creditLimit, account.currencyCode);
</script>
