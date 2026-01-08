<template>
  <div class="p-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <h1 class="text-2xl tracking-wider">{{ $t('accounts.title') }}</h1>

      <div class="flex flex-wrap gap-x-4 gap-y-2">
        <CreateAccountDialog>
          <UiButton variant="outline"> {{ $t('accounts.createAccount') }} </UiButton>
        </CreateAccountDialog>

        <UiButton as-child>
          <router-link :to="{ name: ROUTES_NAMES.accountIntegrations }">
            {{ $t('accounts.bankIntegrations') }}
          </router-link>
        </UiButton>
      </div>
    </div>

    <template v-if="accounts.length">
      <div class="grid gap-6">
        <template v-for="key in Object.keys(groupedAccounts)">
          <template v-if="groupedAccounts[key].length">
            <Section :default-open="key === 'hidden' ? false : true">
              <template #trigger-content>
                <h2 class="xs:text-lg text-base font-semibold">
                  <template v-if="key === 'hidden'">{{ $t('accounts.sections.hidden') }}</template>
                  <template v-else-if="key === 'manual'">{{ $t('accounts.sections.manual') }}</template>
                  <template v-else-if="key === 'integrations'">{{ $t('accounts.sections.connected') }}</template>
                </h2>
              </template>

              <template #content>
                <div class="xs:gap-3 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                  <template v-for="account in groupedAccounts[key]" :key="account.id">
                    <AccountCard :account="account" />
                  </template>
                </div>
              </template>
            </Section>
          </template>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="py-12 text-center">
        <div class="mb-4">
          <LandmarkIcon class="text-muted-foreground mx-auto size-12" />
        </div>
        <h3 class="text-foreground mb-2 text-lg font-medium">{{ $t('accounts.empty.title') }}</h3>
        <p class="text-muted-foreground mb-6">
          {{ $t('accounts.empty.description') }}
        </p>

        <div class="mx-auto flex max-w-sm flex-col gap-3">
          <UiButton size="lg" @click="openAddIntegrationDialog">
            <LinkIcon class="mr-2 size-5" />
            {{ $t('accounts.empty.connectBank') }}
          </UiButton>

          <CreateAccountDialog>
            <UiButton variant="outline">
              <PlusIcon class="mr-2 size-4" />
              {{ $t('accounts.empty.createManual') }}
            </UiButton>
          </CreateAccountDialog>
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
import CreateAccountDialog from '@/components/dialogs/create-account-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import AddIntegrationDialog from '@/pages/accounts/integrations/components/add-integration-dialog.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { LandmarkIcon, LinkIcon, PlusIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

import AccountCard from './components/account-card.vue';
import Section from './components/section.vue';

const { accounts } = storeToRefs(useAccountsStore());
const queryClient = useQueryClient();

type AccountTypeKey = 'integrations' | 'manual' | 'hidden';

const groupedAccounts = computed(() =>
  accounts.value.reduce(
    (acc, account) => {
      if (!account.isEnabled) {
        acc.hidden.push(account);
      } else {
        if (typeof account.bankDataProviderConnectionId === 'number') {
          acc.integrations.push(account);
        } else {
          acc.manual.push(account);
        }
      }
      return acc;
    },
    { integrations: [], manual: [], hidden: [] } as Record<AccountTypeKey, AccountModel[]>,
  ),
);

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
