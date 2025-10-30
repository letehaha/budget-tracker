<script setup lang="ts">
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import AccountDetailsTab from '@/pages/account/components/account-details-tab.vue';
import SettingAccountGroup from '@/pages/account/components/account-group.vue';
import SettingToggleVisibility from '@/pages/account/components/setting-toggle-visibility.vue';
import AccountDeletionSection from '@/pages/account/components/account-deletion-section.vue';
import { ACCOUNT_TYPES, AccountModel, TransactionModel } from '@bt/shared/types';

import LoadLatestTransactions from './load-latest-transactions.vue';
import LoadTransactions from './load-transactions.vue';

defineProps<{
  account: AccountModel;
  transactions: TransactionModel[];
}>();
</script>

<template>
  <Tabs.Tabs default-value="details">
    <Tabs.TabsList class="mt-4 w-full justify-start">
      <Tabs.TabsTrigger value="details"> Details </Tabs.TabsTrigger>
      <Tabs.TabsTrigger value="settings"> Settings </Tabs.TabsTrigger>
    </Tabs.TabsList>

    <AccountDetailsTab tab-name="details" :account="account" />

    <Tabs.TabsContent value="settings">
      <div class="grid gap-4 pt-6">
        <SettingToggleVisibility :account="account" />

        <Separator />

        <SettingAccountGroup :account="account" />

        <Separator />

        <template v-if="account.type === ACCOUNT_TYPES.monobank">
          <LoadLatestTransactions :account="account" />
        </template>

        <Separator />

        <LoadTransactions :account="account" />

        <Separator />

        <AccountDeletionSection :account="account" :transactions="transactions" />
      </div>
    </Tabs.TabsContent>
  </Tabs.Tabs>
</template>
