<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">Admin Panel</h2>
      <p class="text-sm opacity-80">Administrative tools and system management</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <div>
        <h3 class="mb-2 text-lg font-medium">Securities Price Sync</h3>
        <p class="mb-4 text-sm leading-relaxed">
          Manually trigger price synchronization for all securities with holdings
        </p>

        <div class="mb-4">
          <Button :disabled="isPriceSyncLoading" @click="triggerPriceSync">
            <span
              v-if="isPriceSyncLoading"
              class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            />
            {{ isPriceSyncLoading ? 'Syncing...' : 'Trigger Price Sync' }}
          </Button>
        </div>
      </div>

      <div>
        <h3 class="mb-2 text-lg font-medium">Manual Security Price Upload</h3>
        <p class="mb-4 text-sm leading-relaxed">Upload historical price data for securities via CSV or JSON files</p>

        <SecurityPriceUpload>
          <Button>Upload Security Prices</Button>
        </SecurityPriceUpload>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { triggerSecuritiesPriceSync } from '@/api/investments';
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useUserStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import SecurityPriceUpload from './security-price-upload.vue';

const userStore = useUserStore();
const router = useRouter();
const { addNotification } = useNotificationCenter();

const isPriceSyncLoading = ref(false);
const showAccessDenied = ref(false);

const triggerPriceSync = async () => {
  isPriceSyncLoading.value = true;

  try {
    await triggerSecuritiesPriceSync();

    addNotification({
      id: 'price-sync-success',
      text: 'Securities prices sync completed successfully',
      type: NotificationType.success,
    });
  } catch (error) {
    const errorData = error?.data;
    const errorMessage = error?.message || 'Failed to trigger price sync';

    if (errorData?.code === API_ERROR_CODES.tooManyRequests) {
      const retryAfter = errorData?.details?.retryAfter || 300; // Default 5 minutes
      const minutes = Math.ceil(retryAfter / 60);

      addNotification({
        id: 'price-sync-rate-limited',
        text: `Not allowed. Try again in ${retryAfter < 60 ? `${retryAfter} seconds` : `${minutes} minutes`}.`,
        type: NotificationType.warning,
      });
    }
    // Check if it's an admin access error
    else if (errorData?.code === 'unauthorized' || errorMessage.includes('Admin')) {
      showAccessDenied.value = true;
      addNotification({
        id: 'admin-access-denied',
        text: 'Admin privileges required for this action',
        type: NotificationType.error,
      });
    } else {
      addNotification({
        id: 'price-sync-error',
        text: 'Failed to trigger price sync',
        type: NotificationType.error,
      });
    }
  } finally {
    isPriceSyncLoading.value = false;
  }
};

// Check admin access on mount
onMounted(() => {
  if (!userStore.user) {
    router.push('/');
  }
});
</script>
