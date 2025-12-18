<template>
  <div class="p-6">
    <UiTabs :initial-tab="initialTab" :options="tabs" tabs-alignment="flex-start" />

    <router-view />
  </div>
</template>

<script setup lang="ts">
import UiTabs, { type Tab } from '@/components/ui-tabs.vue';
import { ROUTES_NAMES } from '@/routes';
import { useUserStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const { user } = storeToRefs(useUserStore());

const showAdminTab = ref(user.value.isAdmin);

const baseTabs: Tab[] = [
  {
    name: 'currencies',
    label: 'Currencies',
    to: { name: ROUTES_NAMES.settingsCurrencies },
  },
  {
    name: 'categories',
    label: 'Categories',
    to: { name: ROUTES_NAMES.settingsCategories },
  },
  {
    name: 'accounts',
    label: 'Accounts groups',
    to: { name: ROUTES_NAMES.settingsAccounts },
  },
  {
    name: 'data-management',
    label: 'Data Management',
    to: { name: ROUTES_NAMES.settingsDataManagement },
  },
  {
    name: 'ai',
    label: 'AI',
    to: { name: ROUTES_NAMES.settingsAi },
  },
];

const adminTab: Tab = {
  name: 'admin',
  label: 'Admin',
  to: { name: ROUTES_NAMES.settingsAdmin },
};

const tabs = computed(() => {
  const allTabs = [...baseTabs];
  if (showAdminTab.value) {
    allTabs.push(adminTab);
  }
  return allTabs;
});

const initialTab = computed(() => tabs.value.find((i) => i.name === route.path.split('/').at(-1)));
</script>
