<script setup lang="ts">
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import AccountArchiveSection from '@/pages/account/components/account-archive-section.vue';
import AccountDeletionSection from '@/pages/account/components/account-deletion-section.vue';
import AccountDetailsTab from '@/pages/account/components/account-details-tab.vue';
import SettingAccountGroup from '@/pages/account/components/account-group.vue';
import AccountLinkSection from '@/pages/account/components/account-link-section.vue';
import SettingToggleVisibility from '@/pages/account/components/setting-toggle-visibility.vue';
import { AccountModel, TransactionModel } from '@bt/shared/types';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  account: AccountModel;
  transactions: TransactionModel[];
}>();

const isOwner = computed(() => props.account.share?.isOwner ?? true);

const activeTab = ref('details');
const tabItems = computed(() => {
  const items = [{ value: 'details', label: t('pages.account.tabs.details') }];
  if (isOwner.value) items.push({ value: 'integrations', label: t('pages.account.tabs.integrations') });
  items.push({ value: 'settings', label: t('pages.account.tabs.settings') });
  return items;
});
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

        <template v-if="isOwner">
          <Separator />

          <AccountArchiveSection :account="account" />

          <AccountDeletionSection :account="account" :transactions="transactions" />
        </template>
      </div>
    </Tabs.TabsContent>

    <Tabs.TabsContent v-if="isOwner" value="integrations">
      <div class="grid gap-4 py-6">
        <AccountLinkSection :account="account" />
      </div>
    </Tabs.TabsContent>
  </Tabs.Tabs>
</template>
