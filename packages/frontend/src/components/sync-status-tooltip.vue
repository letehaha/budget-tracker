<template>
  <div class="max-w-[400px] min-w-[280px] space-y-3 p-2">
    <p class="mb-2 text-sm">Banks connections sync status</p>

    <!-- Just completed: Show success message -->
    <div v-if="showSuccessMessage" class="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700">
      <CheckCircle2 class="size-5 shrink-0" />
      <span class="font-medium">Synced successfully</span>
    </div>

    <!-- Syncing in progress: Show progress bar + pending/syncing accounts -->
    <div v-else-if="isSyncing">
      <div class="space-y-3">
        <!-- Progress bar -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium">{{ syncProgress.current }} of {{ syncProgress.total }}</span>
            <span class="text-muted-foreground">{{ syncProgress.percentage }}%</span>
          </div>
          <div class="bg-muted h-2 overflow-hidden rounded-full">
            <div
              class="bg-primary h-full transition-all duration-300"
              :style="{ width: `${syncProgress.percentage}%` }"
            />
          </div>
        </div>

        <!-- Active accounts (pending/syncing only) -->
        <div v-if="activeAccounts.length > 0" class="max-h-[240px] space-y-2 overflow-y-auto">
          <div
            v-for="account in activeAccounts"
            :key="account.accountId"
            class="border-border flex items-center justify-between gap-2 rounded border p-2 text-xs"
          >
            <div class="flex-1 truncate">
              <div class="max-w-[200px] truncate font-medium">{{ account.accountName }}</div>
              <div class="text-muted-foreground text-[10px]">{{ METAINFO_FROM_TYPE[account.providerType].name }}</div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <component
                :is="getStatusIcon(account.status)"
                :class="[getStatusColor(account.status), { 'animate-spin': account.status === SyncStatus.SYNCING }]"
                class="size-3"
              />
              <span :class="getStatusColor(account.status)" class="text-[10px] font-medium uppercase">
                {{ getStatusText(account.status) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Default view: Show last sync time and sync button -->
    <div v-else class="space-y-3">
      <div
        v-if="accountStatuses.length === 0"
        class="text-muted-foreground flex flex-col items-center gap-2 py-4 text-center text-sm"
      >
        <Building2 class="size-10 opacity-50" />
        <span>No bank accounts connected</span>

        <Button as-child size="sm" class="mt-4 w-full">
          <RouterLink to="/accounts/integrations"> Connect </RouterLink>
        </Button>
      </div>

      <template v-else-if="accountStatuses.length !== 0">
        <div v-if="lastSyncTimestamp" class="text-muted-foreground text-xs">
          Last synced: {{ formatLastSyncTime(lastSyncTimestamp) }}
        </div>
        <div v-else class="text-muted-foreground text-xs">Never synced</div>

        <Button
          class="w-full"
          size="sm"
          :disabled="isLoading || accountStatuses.length === 0"
          @click="$emit('triggerSync')"
        >
          <RefreshCcw :class="{ 'animate-spin': isLoading }" class="mr-2 size-4" />
          Sync Now
        </Button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type AccountSyncStatus, SyncStatus } from '@/api/bank-data-providers';
import { METAINFO_FROM_TYPE } from '@/common/const/bank-providers';
import Button from '@/components/lib/ui/button/Button.vue';
import { Building2, CheckCircle2, Circle, Clock, Loader2, RefreshCcw, XCircle } from 'lucide-vue-next';
import { computed } from 'vue';

const props = defineProps<{
  accountStatuses: AccountSyncStatus[];
  syncProgress: { current: number; total: number; percentage: number };
  lastSyncTimestamp: number | null;
  isLoading?: boolean;
  isSyncing?: boolean;
  showSuccessMessage?: boolean;
}>();

defineEmits<{
  triggerSync: [];
}>();

// Filter accounts to show only pending/queued/syncing during sync
const activeAccounts = computed(() => {
  return props.accountStatuses.filter(
    (account) => account.status === SyncStatus.QUEUED || account.status === SyncStatus.SYNCING,
  );
});

const getStatusIcon = (status: SyncStatus) => {
  switch (status) {
    case SyncStatus.SYNCING:
      return Loader2;
    case SyncStatus.QUEUED:
      return Clock;
    case SyncStatus.COMPLETED:
      return CheckCircle2;
    case SyncStatus.FAILED:
      return XCircle;
    default:
      return Circle;
  }
};

const getStatusColor = (status: SyncStatus) => {
  switch (status) {
    case SyncStatus.SYNCING:
      return 'text-primary';
    case SyncStatus.QUEUED:
      return 'text-yellow-500';
    case SyncStatus.COMPLETED:
      return 'text-green-500';
    case SyncStatus.FAILED:
      return 'text-red-500';
    default:
      return 'text-gray-400';
  }
};

const getStatusText = (status: SyncStatus) => {
  switch (status) {
    case SyncStatus.SYNCING:
      return 'Syncing';
    case SyncStatus.QUEUED:
      return 'Queued';
    case SyncStatus.COMPLETED:
      return 'Synced';
    case SyncStatus.FAILED:
      return 'Failed';
    default:
      return 'Idle';
  }
};

const formatLastSyncTime = (timestamp: number) => {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  }
  if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
};
</script>
