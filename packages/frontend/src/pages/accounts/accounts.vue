<template>
  <PageWrapper>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <h1 class="text-2xl tracking-wider">{{ $t('accounts.title') }}</h1>

      <div class="flex flex-wrap gap-2">
        <CreateVehicleDialog @created="onVehicleCreated">
          <UiButton variant="outline">{{ $t('accounts.createVehicle') }}</UiButton>
        </CreateVehicleDialog>

        <CreateAccountDialog>
          <UiButton> {{ $t('accounts.createAccount') }} </UiButton>
        </CreateAccountDialog>
      </div>
    </div>

    <template v-if="accounts?.length || vehicles?.length">
      <div class="grid gap-6">
        <template v-for="key in Object.keys(groupedAccounts) as AccountTypeKey[]">
          <template v-if="groupedAccounts[key].length">
            <Section :default-open="key === 'archived' ? false : true">
              <template #trigger-content>
                <h2 class="xs:text-lg text-base font-semibold">
                  <template v-if="key === 'archived'">{{ $t('accounts.sections.archived') }}</template>
                  <template v-else-if="key === 'manual'">{{ $t('accounts.sections.manual') }}</template>
                  <template v-else-if="key === 'integrations'">{{ $t('accounts.sections.connected') }}</template>
                  <template v-else-if="key === 'sharedWithMe'">{{ $t('accounts.sections.sharedWithMe') }}</template>
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

        <template v-if="vehicles && vehicles.length">
          <Section :default-open="true">
            <template #trigger-content>
              <h2 class="xs:text-lg text-base font-semibold">{{ $t('accounts.sections.vehicles') }}</h2>
            </template>
            <template #content>
              <div class="xs:gap-3 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                <template v-for="vehicle in vehicles" :key="vehicle.id">
                  <VehicleCard :vehicle="vehicle" />
                </template>
              </div>
            </template>
          </Section>
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
  </PageWrapper>
</template>

<script lang="ts" setup>
import { type BankProvider, listProviders } from '@/api/bank-data-providers';
import { getVehicles } from '@/api/vehicles';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import PageWrapper from '@/components/common/page-wrapper.vue';
import CreateAccountDialog from '@/components/dialogs/create-account-dialog.vue';
import CreateVehicleDialog from '@/components/dialogs/create-vehicle-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import AddIntegrationDialog from '@/pages/accounts/integrations/components/add-integration-dialog.vue';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_CATEGORIES, ACCOUNT_STATUSES, AccountModel } from '@bt/shared/types';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { LandmarkIcon, LinkIcon, PlusIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

import AccountCard from './components/account-card.vue';
import Section from './components/section.vue';
import VehicleCard from './components/vehicle-card.vue';

const { accounts } = storeToRefs(useAccountsStore());
const queryClient = useQueryClient();

type AccountTypeKey = 'integrations' | 'manual' | 'sharedWithMe' | 'archived';

const { data: vehicles, refetch: refetchVehicles } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.vehiclesList,
  queryFn: getVehicles,
});

const vehicleAccountIds = computed(() => new Set((vehicles.value ?? []).map((v) => v.accountId)));

const groupedAccounts = computed(() =>
  (accounts.value ?? []).reduce(
    (acc, account) => {
      // Vehicles render in their own section — keep them out of the manual list.
      if (account.accountCategory === ACCOUNT_CATEGORIES.vehicle || vehicleAccountIds.value.has(account.id)) {
        return acc;
      }
      if (account.share?.isOwner === false) {
        // Shared accounts always render in their own section, regardless of archive status
        // or connection origin (the recipient doesn't see the owner's bank-link metadata).
        acc.sharedWithMe.push(account);
      } else if (account.status === ACCOUNT_STATUSES.archived) {
        acc.archived.push(account);
      } else if (account.bankDataProviderConnectionId) {
        acc.integrations.push(account);
      } else {
        acc.manual.push(account);
      }
      return acc;
    },
    { integrations: [], manual: [], sharedWithMe: [], archived: [] } as Record<AccountTypeKey, AccountModel[]>,
  ),
);

const onVehicleCreated = () => {
  refetchVehicles();
};

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
