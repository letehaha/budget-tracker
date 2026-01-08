<script setup lang="ts">
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import AccountDeletionSection from '@/pages/account/components/account-deletion-section.vue';
import AccountDetailsTab from '@/pages/account/components/account-details-tab.vue';
import SettingAccountGroup from '@/pages/account/components/account-group.vue';
import SettingToggleVisibility from '@/pages/account/components/setting-toggle-visibility.vue';
import { AccountModel, TransactionModel } from '@bt/shared/types';
import { useI18n } from 'vue-i18n';

import LoadTransactions from './load-transactions.vue';
import SyncTransactions from './sync-transactions.vue';

const { t } = useI18n();

defineProps<{
  account: AccountModel;
  transactions: TransactionModel[];
}>();
</script>

<template>
  <Tabs.Tabs default-value="details">
    <Tabs.TabsList class="mt-4 w-full justify-start">
      <Tabs.TabsTrigger value="details">{{ t('pages.account.tabs.details') }}</Tabs.TabsTrigger>
      <Tabs.TabsTrigger value="settings">{{ t('pages.account.tabs.settings') }}</Tabs.TabsTrigger>
    </Tabs.TabsList>

    <AccountDetailsTab tab-name="details" :account="account" />

    <Tabs.TabsContent value="settings">
      <div class="grid gap-4 pt-6">
        <SettingToggleVisibility :account="account" />

        <Separator />

        <SettingAccountGroup :account="account" />

        <Separator />

        <SyncTransactions :account="account" />

        <Separator />

        <LoadTransactions :account="account" />

        <Separator />

        <AccountDeletionSection :account="account" :transactions="transactions" />
      </div>
    </Tabs.TabsContent>
  </Tabs.Tabs>
</template>
