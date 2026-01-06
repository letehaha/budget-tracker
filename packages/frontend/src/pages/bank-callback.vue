<template>
  <div class="flex min-h-screen items-center justify-center px-4">
    <div class="w-full max-w-md rounded-lg p-8 shadow-lg">
      <div v-if="isProcessing" class="text-center">
        <InfoIcon class="mb-4 size-12" />

        <h2 class="mb-2 text-xl font-semibold">Completing Authorization...</h2>

        <p class="text-muted-foreground text-sm">Please wait while we verify your bank connection</p>
      </div>

      <div v-else-if="error" class="text-center">
        <InfoIcon class="text-destructive-text mx-auto mb-4 size-12" />

        <h2 class="text-destructive-text mb-2 text-xl font-semibold">Authorization Failed</h2>

        <p class="text-muted-foreground mb-6 text-sm">{{ error }}</p>
        <button
          @click="goToIntegrations"
          class="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium dark:text-white"
        >
          Back to Integrations
        </button>
      </div>

      <div v-else-if="success" class="text-center">
        <CheckCircle2Icon class="text-success-text mx-auto mb-4 size-12" />

        <h2 class="text-success-text mb-2 text-xl font-semibold">Connection Successful!</h2>

        <p class="text-muted-foreground mb-6 text-sm">Your bank account has been connected successfully.</p>

        <button
          @click="goToAccounts"
          class="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium dark:text-white"
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
import { CheckCircle2Icon, InfoIcon } from 'lucide-vue-next';
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

    setTimeout(() => {
      router.push({
        name: ROUTES_NAMES.accountIntegrationDetails,
        params: { connectionId },
      });
    }, 2000);
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
