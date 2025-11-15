<template>
  <div class="p-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <h1 class="text-2xl tracking-wider">Accounts</h1>

      <div class="flex flex-wrap gap-x-4 gap-y-2">
        <UiButton as-child variant="outline">
          <router-link :to="{ name: ROUTES_NAMES.createAccount }"> Create account </router-link>
        </UiButton>

        <UiButton as-child>
          <router-link :to="{ name: ROUTES_NAMES.accountIntegrations }"> Bank Integrations </router-link>
        </UiButton>
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
      <div class="py-12 text-center">
        <div class="mb-4">
          <LandmarkIcon class="text-muted-foreground mx-auto size-12" />
        </div>
        <h3 class="text-foreground mb-2 text-lg font-medium">No Accounts Yet</h3>
        <p class="text-muted-foreground mb-6">
          Connect your bank or create a manual account to start tracking your finances, balances, and transactions.
        </p>

        <div class="mx-auto flex max-w-sm flex-col gap-3">
          <UiButton size="lg" @click="openAddIntegrationDialog">
            <LinkIcon class="mr-2 size-5" />
            Connect Bank Account
          </UiButton>

          <UiButton as-child variant="outline">
            <router-link :to="{ name: ROUTES_NAMES.createAccount }">
              <PlusIcon class="mr-2 size-4" />
              Create Manual Account
            </router-link>
          </UiButton>
        </div>
      </div>
    </template>

    <!-- Add Integration Dialog -->
    <AddIntegrationDialog
      v-model:open="isDialogOpen"
      :providers="providers || []"
      @integration-added="handleIntegrationAdded"
    />
  </div>
</template>

<script lang="ts" setup>
import { type BankProvider, listProviders } from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable';
import { cn } from '@/lib/utils';
import AddIntegrationDialog from '@/pages/accounts/integrations/components/AddIntegrationDialog.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { LandmarkIcon, LinkIcon, PlusIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

const { accounts } = storeToRefs(useAccountsStore());
const queryClient = useQueryClient();

const { formatAmountByCurrencyCode } = useFormatCurrency();

const formattedAccounts = computed(() => [...accounts.value].sort((a, b) => +b.isEnabled - +a.isEnabled));

const formatBalance = (account: AccountModel) =>
  formatAmountByCurrencyCode(account.currentBalance - account.creditLimit, account.currencyCode);

// Integration dialog state
const isDialogOpen = ref(false);

// Query for providers
const { data: providers } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.bankProviders,
  queryFn: listProviders,
  staleTime: Infinity,
  placeholderData: [] as BankProvider[],
});

const openAddIntegrationDialog = () => {
  isDialogOpen.value = true;
};

const handleIntegrationAdded = () => {
  isDialogOpen.value = false;
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.bankConnections });
};
</script>
