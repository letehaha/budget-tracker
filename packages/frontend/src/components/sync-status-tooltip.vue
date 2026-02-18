<template>
  <div class="max-w-100 min-w-70 space-y-3 p-2">
    <p class="mb-2 text-sm">{{ $t('syncStatusTooltip.title') }}</p>

    <!-- Just completed: Show success message -->
    <div v-if="showSuccessMessage" class="bg-success text-success-text flex items-center gap-2 rounded-md p-3 text-sm">
      <CheckCircle2 class="size-5 shrink-0" />
      <span class="font-medium">{{ $t('syncStatusTooltip.syncedSuccessfully') }}</span>
    </div>

    <!-- Syncing in progress: Show progress bar + pending/syncing accounts -->
    <div v-else-if="isSyncing">
      <div class="space-y-3">
        <!-- Progress bar -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium">{{
              $t('syncStatusTooltip.progress', { current: syncProgress.current, total: syncProgress.total })
            }}</span>
            <span class="text-muted-foreground">{{
              $t('syncStatusTooltip.progressPercentage', { percentage: syncProgress.percentage })
            }}</span>
          </div>
          <div class="bg-muted h-2 overflow-hidden rounded-full">
            <div
              class="bg-primary h-full transition-all duration-300"
              :style="{ width: `${syncProgress.percentage}%` }"
            />
          </div>
        </div>

        <!-- Active accounts (pending/syncing only) -->
        <div v-if="activeAccounts.length > 0" class="max-h-60 space-y-2 overflow-y-auto">
          <div
            v-for="account in activeAccounts"
            :key="account.accountId"
            class="border-border flex items-center justify-between gap-2 rounded border p-2 text-xs"
          >
            <div class="flex-1 truncate">
              <div class="max-w-50 truncate font-medium">{{ account.accountName }}</div>
              <div class="text-muted-foreground text-[10px]">
                {{ t(METAINFO_FROM_TYPE[account.providerType].nameKey) }}
              </div>
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

    <!-- AI Categorization Section -->
    <div v-if="isCategorizing || categorizationJustCompleted" class="border-border space-y-2 border-t pt-3">
      <div class="flex items-center gap-2">
        <SparklesIcon class="text-primary size-4" />
        <span class="text-sm font-medium">{{ $t('header.categorization.title') }}</span>
      </div>

      <template v-if="categorizationJustCompleted && categorizationStatus?.status === 'completed'">
        <div class="text-success-text flex items-center gap-2 text-xs">
          <CheckCircle2 class="size-4" />
          <span>{{ $t('header.categorization.completedShort') }}</span>
        </div>
      </template>

      <template v-else-if="categorizationJustCompleted && categorizationStatus?.status === 'failed'">
        <div class="flex items-center gap-2 text-xs text-red-500">
          <XCircle class="size-4" />
          <span>{{ $t('header.categorization.failedShort') }}</span>
        </div>
      </template>

      <template v-else-if="isCategorizing && categorizationStatus">
        <!-- Progress bar -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-muted-foreground">
              {{ categorizationStatus.processedCount }} / {{ categorizationStatus.totalCount }}
              {{ $t('header.categorization.transactions') }}
            </span>
            <span class="text-muted-foreground">{{ categorizationProgress }}%</span>
          </div>
          <div class="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              class="bg-primary h-full transition-all duration-300"
              :style="{ width: `${categorizationProgress}%` }"
            />
          </div>
        </div>

        <div v-if="categorizationStatus.status === 'queued'" class="text-muted-foreground text-xs">
          {{ $t('header.categorization.queued') }}
        </div>
      </template>
    </div>

    <!-- Default view: Show last sync time and sync button -->
    <div v-if="!isSyncing && !showSuccessMessage" class="space-y-3">
      <div
        v-if="accountStatuses.length === 0"
        class="text-muted-foreground flex flex-col items-center gap-2 py-4 text-center text-sm"
      >
        <Building2 class="size-10 opacity-50" />
        <span>{{ $t('syncStatusTooltip.noBankAccounts') }}</span>

        <Button as-child size="sm" class="mt-4 w-full">
          <RouterLink to="/accounts/integrations">{{ $t('syncStatusTooltip.connectButton') }}</RouterLink>
        </Button>
      </div>

      <template v-else-if="accountStatuses.length !== 0">
        <div v-if="lastSyncTimestamp" class="text-muted-foreground text-xs">
          {{ $t('syncStatusTooltip.lastSynced') }} {{ formatLastSyncTime(lastSyncTimestamp) }}
        </div>
        <div v-else class="text-muted-foreground text-xs">{{ $t('syncStatusTooltip.neverSynced') }}</div>

        <Button
          class="w-full"
          size="sm"
          :disabled="isLoading || accountStatuses.length === 0"
          @click="$emit('triggerSync')"
        >
          <RefreshCcw :class="{ 'animate-spin': isLoading }" class="mr-2 size-4" />
          {{ $t('syncStatusTooltip.syncNowButton') }}
        </Button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type AccountSyncStatus, SyncStatus } from '@/api/bank-data-providers';
import { METAINFO_FROM_TYPE } from '@/common/const/bank-providers';
import Button from '@/components/lib/ui/button/Button.vue';
import type { AiCategorizationProgressPayload } from '@bt/shared/types';
import { Building2, CheckCircle2, Circle, Clock, Loader2, RefreshCcw, SparklesIcon, XCircle } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  accountStatuses: AccountSyncStatus[];
  syncProgress: { current: number; total: number; percentage: number };
  lastSyncTimestamp: number | null;
  isLoading?: boolean;
  isSyncing?: boolean;
  showSuccessMessage?: boolean;
  // AI Categorization props
  categorizationStatus?: AiCategorizationProgressPayload | null;
  isCategorizing?: boolean;
  categorizationProgress?: number;
  categorizationJustCompleted?: boolean;
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
      return t('syncStatusTooltip.statuses.syncing');
    case SyncStatus.QUEUED:
      return t('syncStatusTooltip.statuses.queued');
    case SyncStatus.COMPLETED:
      return t('syncStatusTooltip.statuses.synced');
    case SyncStatus.FAILED:
      return t('syncStatusTooltip.statuses.failed');
    default:
      return t('syncStatusTooltip.statuses.idle');
  }
};

const formatLastSyncTime = (timestamp: number) => {
  const diffMs = Date.now() - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
  const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
  const diffYears = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));

  if (diffYears > 0) {
    return t('syncStatusTooltip.timeAgo.yearsAgo', diffYears);
  }
  if (diffMonths > 0) {
    return t('syncStatusTooltip.timeAgo.monthsAgo', diffMonths);
  }
  if (diffWeeks > 0) {
    return t('syncStatusTooltip.timeAgo.weeksAgo', diffWeeks);
  }
  if (diffDays > 0) {
    return t('syncStatusTooltip.timeAgo.daysAgo', diffDays);
  }
  if (diffHours > 0) {
    return t('syncStatusTooltip.timeAgo.hoursAgo', diffHours);
  }
  if (diffMinutes > 0) {
    return t('syncStatusTooltip.timeAgo.minutesAgo', diffMinutes);
  }
  if (diffSeconds > 5) {
    return t('syncStatusTooltip.timeAgo.secondsAgo', diffSeconds);
  }
  return t('syncStatusTooltip.timeAgo.justNow');
};
</script>
