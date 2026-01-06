<template>
  <main class="bg-background">
    <router-view />

    <notifications-center />

    <!-- Dialog for legacy users to migrate to email-based auth -->
    <LegacyAccountMigrationDialog v-if="isLoggedIn" />
  </main>
</template>

<script setup lang="ts">
import LegacyAccountMigrationDialog from '@/components/banners/legacy-account-migration-dialog.vue';
import NotificationsCenter from '@/components/notification-center/notifications-center.vue';
import { useExchangeRates } from '@/composable/data-queries/currencies';
import { useAiCategorizationEvents } from '@/composable/use-ai-categorization-events';
import { useSSE } from '@/composable/use-sse';
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

// Prefetch exchange rates for components that need them
useExchangeRates({ enabled: isLoggedIn });

// SSE for real-time updates
const { disconnect: disconnectSSE } = useSSE();
const { initialize: initializeAiCategorizationEvents, cleanup: cleanupAiCategorizationEvents } =
  useAiCategorizationEvents();

watch(
  isLoggedIn,
  (value, prevValue) => {
    if (prevValue && !value) {
      // User logged out - cleanup SSE
      cleanupAiCategorizationEvents();
      disconnectSSE();
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

      // Initialize SSE for real-time updates (AI categorization, etc.)
      initializeAiCategorizationEvents();
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
