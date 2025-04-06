<template>
  <main class="page">
    <router-view />

    <notifications-center />
  </main>
</template>

<script setup lang="ts">
import NotificationsCenter from '@/components/notification-center/notifications-center.vue';
import { ROUTES_NAMES } from '@/routes';
import { useAuthStore, useCurrenciesStore, useRootStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { watch } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const authStore = useAuthStore();
const rootStore = useRootStore();
const userCurrenciesStore = useCurrenciesStore();

const { isAppInitialized } = storeToRefs(rootStore);
const { isLoggedIn } = storeToRefs(authStore);
const { isBaseCurrencyExists } = storeToRefs(userCurrenciesStore);

watch(
  isLoggedIn,
  (value, prevValue) => {
    if (prevValue && !value) {
      router.push({ name: ROUTES_NAMES.signIn });
    }
  },
  { immediate: true },
);

watch(
  isLoggedIn,
  async (value) => {
    if (value) {
      await rootStore.fetchInitialData();
      await rootStore.syncFinancialData();
    }
  },
  { immediate: true },
);

watch(isAppInitialized, (value) => {
  if (value && !isBaseCurrencyExists.value) {
    router.push({ name: ROUTES_NAMES.welcome });
  }
});
</script>

<style lang="scss" scoped>
.page {
  height: 100dvh;
  background-color: var(--background);
}
</style>
