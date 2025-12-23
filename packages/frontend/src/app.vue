<template>
  <main class="bg-background">
    <router-view />

    <notifications-center />
  </main>
</template>

<script setup lang="ts">
import NotificationsCenter from '@/components/notification-center/notifications-center.vue';
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
