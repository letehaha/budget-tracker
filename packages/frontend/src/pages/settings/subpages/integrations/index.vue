<script setup lang="ts">
import LunchflowSetToken from '@/components/dialogs/lunchflow-set-token.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/lib/ui/card';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useBanksLunchflowStore } from '@/stores/integrations/banks/lunchflow';
import { onMounted, ref } from 'vue';

const lunchflowStore = useBanksLunchflowStore();
const { addNotification } = useNotificationCenter();

const isSyncing = ref(false);

onMounted(async () => {
  await lunchflowStore.checkConnection();
});

const handleConnected = async () => {
  // After connection, automatically sync accounts
  try {
    isSyncing.value = true;
    const response = await lunchflowStore.syncAccountsFromLunchflow();

    addNotification({
      text: `${response.message}. ${response.newCount} new account(s) added.`,
      type: NotificationType.success,
    });
  } catch {
    addNotification({
      text: 'Failed to sync accounts after connection',
      type: NotificationType.error,
    });
  } finally {
    isSyncing.value = false;
  }
};

const syncAccounts = async () => {
  try {
    isSyncing.value = true;
    const response = await lunchflowStore.syncAccountsFromLunchflow();

    addNotification({
      text: `${response.message}. ${response.newCount} new account(s) added.`,
      type: NotificationType.success,
    });
  } catch {
    addNotification({
      text: 'Failed to sync accounts',
      type: NotificationType.error,
    });
  } finally {
    isSyncing.value = false;
  }
};

const disconnect = async () => {
  if (!confirm("Are you sure you want to disconnect Lunch Flow? Your accounts will remain but won't sync.")) {
    return;
  }

  try {
    await lunchflowStore.disconnect();

    addNotification({
      text: 'Lunch Flow disconnected successfully',
      type: NotificationType.success,
    });
  } catch {
    addNotification({
      text: 'Failed to disconnect Lunch Flow',
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <div class="grid gap-6 pt-6">
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"> Lunch Flow </CardTitle>
        <CardDescription>
          Connect your bank accounts via Lunch Flow to automatically sync transactions and balances.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div v-if="!lunchflowStore.isConnected" class="space-y-4">
          <p class="text-muted-foreground text-sm">
            Lunch Flow uses open banking to securely connect to 2,500+ banks across Europe via GoCardless.
          </p>

          <LunchflowSetToken @connected="handleConnected">
            <Button> Connect Lunch Flow </Button>
          </LunchflowSetToken>

          <div class="bg-muted mt-4 rounded-lg p-4">
            <h4 class="mb-2 text-sm font-medium">How to get your API key:</h4>
            <ol class="text-muted-foreground list-inside list-decimal space-y-1 text-sm">
              <li>
                Visit
                <a href="https://lunchflow.app/dashboard" target="_blank" class="text-primary underline"
                  >Lunch Flow Dashboard</a
                >
              </li>
              <li>Create an API destination</li>
              <li>Copy your API key</li>
              <li>Paste it above to connect</li>
            </ol>
          </div>
        </div>

        <div v-else class="space-y-4">
          <div class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd"
              />
            </svg>
            Connected
          </div>

          <div class="flex gap-2">
            <Button @click="syncAccounts" :disabled="isSyncing || lunchflowStore.isLoading"> Sync Accounts </Button>

            <Button variant="outline" @click="disconnect" :disabled="lunchflowStore.isLoading"> Disconnect </Button>
          </div>

          <p class="text-muted-foreground text-sm">
            To sync transactions and refresh balances for individual accounts, go to the account details page.
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
