<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
    <div class="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
      <div v-if="isProcessing" class="text-center">
        <div class="mb-4">
          <svg class="mx-auto h-12 w-12 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <h2 class="mb-2 text-xl font-semibold">Completing Authorization...</h2>
        <p class="text-muted-foreground text-sm">Please wait while we verify your bank connection</p>
      </div>

      <div v-else-if="error" class="text-center">
        <div class="mb-4">
          <svg class="mx-auto h-12 w-12 text-destructive" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="mb-2 text-xl font-semibold text-destructive">Authorization Failed</h2>
        <p class="text-muted-foreground mb-6 text-sm">{{ error }}</p>
        <button
          @click="goToIntegrations"
          class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Back to Integrations
        </button>
      </div>

      <div v-else-if="success" class="text-center">
        <div class="mb-4">
          <svg class="mx-auto h-12 w-12 text-success" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="mb-2 text-xl font-semibold text-success">Connection Successful!</h2>
        <p class="text-muted-foreground mb-6 text-sm">Your bank account has been connected successfully.</p>
        <button
          @click="goToAccounts"
          class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          View Accounts
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { completeEnableBankingOAuth } from '@/api/bank-data-providers';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes/constants';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const isProcessing = ref(true);
const error = ref('');
const success = ref(false);

onMounted(async () => {
  // Get query parameters from URL
  const code = route.query.code as string;
  const state = route.query.state as string;
  const errorParam = route.query.error as string;
  const errorDescription = route.query.error_description as string;

  // Check for OAuth errors
  if (errorParam) {
    error.value = errorDescription || errorParam || 'Authorization was denied or failed';
    isProcessing.value = false;
    addErrorNotification(error.value);
    return;
  }

  // Validate required parameters
  if (!code || !state) {
    error.value = 'Missing required parameters (code or state)';
    isProcessing.value = false;
    addErrorNotification(error.value);
    return;
  }

  // Get connection ID from localStorage (set by EnableBankingConnector)
  const connectionId = localStorage.getItem('pendingEnableBankingConnectionId');

  if (!connectionId) {
    error.value = 'Connection ID not found. Please start the connection process again.';
    isProcessing.value = false;
    addErrorNotification(error.value);
    return;
  }

  try {
    // Complete OAuth flow
    await completeEnableBankingOAuth(Number(connectionId), code, state);

    // Clear stored connection ID
    localStorage.removeItem('pendingEnableBankingConnectionId');

    success.value = true;
    addSuccessNotification('Bank connection established successfully!');

    // Redirect to connection details page after 1 second
    setTimeout(() => {
      router.push({
        name: ROUTES_NAMES.accountIntegrationDetails,
        params: { connectionId },
      });
    }, 1500);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to complete authorization';
    error.value = message;
    addErrorNotification(message);
  } finally {
    isProcessing.value = false;
  }
});

const goToIntegrations = () => {
  router.push({ name: ROUTES_NAMES.accountIntegrations });
};

const goToAccounts = () => {
  router.push({ name: ROUTES_NAMES.accounts });
};
</script>
