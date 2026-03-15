<script setup lang="ts">
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import AccountDeletionSection from '@/pages/account/components/account-deletion-section.vue';
import AccountDetailsTab from '@/pages/account/components/account-details-tab.vue';
import SettingAccountGroup from '@/pages/account/components/account-group.vue';
import AccountLinkSection from '@/pages/account/components/account-link-section.vue';
import SettingToggleVisibility from '@/pages/account/components/setting-toggle-visibility.vue';
import { AccountModel, TransactionModel } from '@bt/shared/types';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  account: AccountModel;
  transactions: TransactionModel[];
}>();

const activeTab = ref('details');
const tabItems = computed(() => [
  { value: 'details', label: t('pages.account.tabs.details') },
  { value: 'integrations', label: t('pages.account.tabs.integrations') },
  { value: 'settings', label: t('pages.account.tabs.settings') },
]);
</script>

<template>
  <Tabs.Tabs v-model="activeTab">
    <PillTabs v-model="activeTab" :items="tabItems" class="mt-4 w-full" />

    <AccountDetailsTab tab-name="details" :account="account" />

    <Tabs.TabsContent value="settings">
      <div class="grid gap-4 py-6">
        <SettingToggleVisibility :account="account" />

        <Separator />

        <SettingAccountGroup :account="account" />

        <Separator />

        <AccountDeletionSection :account="account" :transactions="transactions" />
      </div>
    </Tabs.TabsContent>

    <Tabs.TabsContent value="integrations">
      <div class="grid gap-4 py-6">
        <AccountLinkSection :account="account" />
      </div>
    </Tabs.TabsContent>
  </Tabs.Tabs>
</template>
