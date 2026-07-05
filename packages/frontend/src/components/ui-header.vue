<template>
  <div ref="headerRef">
    <DemoBanner />
    <div
      ref="headerBarRef"
      class="shadow-header border-border @container/header-bar flex items-center justify-between border-b px-4 py-2 sm:px-6"
    >
      <div class="flex items-center gap-4">
        <template v-if="isMobileView">
          <Sheet.Sheet :open="isMobileSheetOpen" @update:open="isMobileSheetOpen = $event">
            <Sheet.SheetTrigger as-child>
              <Button size="icon-sm" variant="secondary" class="shrink-0">
                <MenuIcon class="size-4" />
              </Button>
            </Sheet.SheetTrigger>
            <Sheet.SheetContent
              side="left"
              :class="[
                'xs:w-3/4 w-full overflow-y-auto px-0',
                'data-[state=closed]:duration-200 data-[state=open]:duration-300',
              ]"
            >
              <Sheet.SheetTitle></Sheet.SheetTitle>
              <Sheet.SheetDescription></Sheet.SheetDescription>

              <Sidebar mobile-view />
            </Sheet.SheetContent>
          </Sheet.Sheet>
        </template>

        <ManageTransactionDialog>
          <Button variant="default" size="sm" class="flex items-center gap-1">
            <PlusIcon class="size-4" />
            <span class="hidden @[580px]/header-bar:block">{{ $t('header.newTransaction') }}</span>
            <span class="@[580px]/header-bar:hidden">{{ $t('header.add') }}</span>
          </Button>
        </ManageTransactionDialog>

        <RouterLink :to="{ name: ROUTES_NAMES.settingsDataManagement }" class="hidden md:block">
          <Button variant="secondary" size="sm" class="flex items-center gap-1">
            <ImportIcon class="size-4" />
            <span class="hidden @[580px]/header-bar:block">{{ $t('header.importData') }}</span>
            <span class="@[580px]/header-bar:hidden">{{ $t('header.import') }}</span>
          </Button>
        </RouterLink>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <DesktopOnlyTooltip :content="$t('header.feedback')" :disabled="!isHeaderBarCompact">
          <Button
            variant="ghost-primary"
            size="sm"
            :class="['flex items-center gap-1.5', { 'feedback-pulse': isFeedbackPulsing }]"
            :aria-label="$t('header.feedback')"
            @mouseenter="onFeedbackEnter"
            @click="openFeedback"
          >
            <FeedbackIcon class="size-5 @[890px]/header-bar:hidden" />
            <span class="hidden @[890px]/header-bar:inline">{{ $t('header.feedback') }}</span>
            <ExternalLinkIcon class="hidden size-3.5 opacity-70 @[890px]/header-bar:inline" />
          </Button>
        </DesktopOnlyTooltip>

        <DesktopOnlyTooltip
          v-if="isSupportButtonVisible"
          :content="$t('header.support')"
          :disabled="!isHeaderBarCompact"
        >
          <Button
            variant="secondary"
            :size="isHeaderBarCompact ? 'icon' : 'sm'"
            class="flex items-center gap-1.5"
            :aria-label="$t('header.support')"
            @click="openSupport"
          >
            <HeartIcon class="text-heart size-4 fill-current" />
            <span class="hidden @[890px]/header-bar:inline">{{ $t('header.support') }}</span>
          </Button>
        </DesktopOnlyTooltip>

        <template v-if="accountsNeedingRelink.length > 0">
          <AccountsRelinkWarning />
        </template>
        <template v-else>
          <Popover.Popover v-model:open="isPopoverOpen">
            <Popover.PopoverTrigger as-child>
              <Button variant="secondary" size="icon" :aria-label="syncButtonLabel">
                <RefreshCcw v-if="syncStatus.isSyncing.value" class="animate-spin" :size="16" />
                <AlertTriangleIcon v-else-if="syncStatus.syncStuck.value" class="text-destructive-text" :size="16" />
                <SparklesIcon
                  v-else-if="categorizationStatus.isCategorizing.value"
                  class="text-primary animate-pulse"
                  :size="16"
                />
                <CloudCheckIcon v-else-if="hasConnections" class="text-success-text size-4" />
                <CloudCheckIcon v-else class="size-4" />
              </Button>
            </Popover.PopoverTrigger>
            <Popover.PopoverContent class="w-auto p-0" align="end">
              <SyncStatusTooltip
                :account-statuses="syncStatus.accountStatuses.value"
                :connections-needing-reauth="syncStatus.connectionsNeedingReauth.value"
                :sync-progress="syncStatus.syncProgress.value"
                :last-sync-timestamp="syncStatus.lastSyncTimestamp.value"
                :is-loading="syncStatus.isLoading.value"
                :is-syncing="syncStatus.isSyncing.value"
                :sync-stuck="syncStatus.syncStuck.value"
                :show-success-message="syncStatus.showSuccessMessage.value"
                :categorization-status="categorizationStatus.categorizationStatus.value"
                :is-categorizing="categorizationStatus.isCategorizing.value"
                :categorization-progress="categorizationStatus.progress.value"
                :categorization-just-completed="categorizationStatus.justCompleted.value"
                @trigger-sync="handleSyncClick"
              />
            </Popover.PopoverContent>
          </Popover.Popover>

          <SyncConfirmationDialog
            v-model:open="showConfirmDialog"
            :last-sync-timestamp="syncStatus.lastSyncTimestamp.value"
            @confirm="confirmSync"
          />
        </template>

        <NotificationsPopover />

        <RouterLink :to="{ name: ROUTES_NAMES.settings }">
          <DesktopOnlyTooltip :content="$t('header.settings')">
            <Button variant="secondary" size="icon" :aria-label="$t('header.settings')">
              <SettingsIcon class="size-4" />
            </Button>
          </DesktopOnlyTooltip>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AccountsRelinkWarning from '@/components/accounts-relink-warning.vue';
import FeedbackIcon from '@/components/common/icons/feedback-icon.vue';
import DemoBanner from '@/components/demo/demo-banner.vue';
import ManageTransactionDialog from '@/components/dialogs/manage-transaction/index.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import * as Sheet from '@/components/lib/ui/sheet';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import NotificationsPopover from '@/components/notifications-popover/index.vue';
import Sidebar from '@/components/sidebar/index.vue';
import SyncConfirmationDialog from '@/components/sync-confirmation-dialog.vue';
import SyncStatusTooltip from '@/components/sync-status-tooltip.vue';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { useCategorizationStatus } from '@/composable/use-categorization-status';
import { useCssVarFromElementSize } from '@/composable/use-css-var-from-element-size';
import { useDateLocale } from '@/composable/use-date-locale';
import { useFeedbackAttention } from '@/composable/use-feedback-attention';
import { useSupportButton } from '@/composable/use-support-button';
import { useSyncStatus } from '@/composable/use-sync-status';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import {
  AlertTriangleIcon,
  CloudCheckIcon,
  ExternalLinkIcon,
  HeartIcon,
  ImportIcon,
  MenuIcon,
  PlusIcon,
  RefreshCcw,
  SettingsIcon,
  SparklesIcon,
} from '@lucide/vue';
import { useResizeObserver } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute } from 'vue-router';

const accountsStore = useAccountsStore();
const { accountsNeedingRelink } = storeToRefs(accountsStore);

const { elementRef: headerRef } = useCssVarFromElementSize({
  cssVars: [{ cssVarName: '--header-height' }],
});

const { t } = useI18n();
const route = useRoute();
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);
const showConfirmDialog = ref(false);
const isPopoverOpen = ref(false);

const { isPulsing: isFeedbackPulsing, onEnter: onFeedbackEnter, onClick: onFeedbackClick } = useFeedbackAttention();

// Mirror the `@[890px]/header-bar` container query that toggles the feedback
// button's label — tooltip is only useful in the icon-only state.
const headerBarRef = ref<HTMLElement | null>(null);
const isHeaderBarCompact = ref(true);
useResizeObserver(headerBarRef, ([entry]) => {
  if (!entry) return;
  isHeaderBarCompact.value = entry.contentRect.width < 890;
});

const FEATUREBASE_URL = 'https://moneymatter.featurebase.app/dashboard/posts';

const openFeedback = () => {
  onFeedbackClick();
  window.open(FEATUREBASE_URL, '_blank', 'noopener,noreferrer');
};

const DONATE_URL = 'https://donatr.ee/letehaha';

const { isSupportButtonVisible } = useSupportButton();

const openSupport = () => {
  window.open(DONATE_URL, '_blank', 'noopener,noreferrer');
};

// Use new sync status system
const syncStatus = useSyncStatus();

// AI categorization status
const categorizationStatus = useCategorizationStatus();

// Locale-aware date formatting
const { formatDistanceToNow } = useDateLocale();

const lastSyncRelativeTime = computed(() => {
  if (!syncStatus.lastSyncTimestamp.value) return null;
  return formatDistanceToNow(new Date(syncStatus.lastSyncTimestamp.value), { addSuffix: true });
});

const hasConnections = computed(() => syncStatus.accountStatuses.value.length > 0);

// Sync button is icon-only, so its meaning lives in the accessible name.
const syncButtonLabel = computed(() => {
  if (syncStatus.isSyncing.value) return t('header.sync.syncing');
  if (syncStatus.syncStuck.value) return t('header.sync.stuck');
  if (categorizationStatus.isCategorizing.value) return t('header.categorization.categorizing');
  if (hasConnections.value) {
    return lastSyncRelativeTime.value
      ? t('header.sync.syncedTime', { time: lastSyncRelativeTime.value })
      : t('header.sync.synchronizing');
  }
  return t('header.sync.connectBank');
});

// Initialize sync status on mount only when user don't have issues with his connections
watch(
  accountsNeedingRelink,
  async (value) => {
    if (value.length) return;
    await syncStatus.fetchStatus();
    // Trigger auto-sync check when app loads
    await syncStatus.checkAndAutoSync();
  },
  { immediate: true },
);

const handleSyncClick = async () => {
  // Check if confirmation is needed
  if (syncStatus.needsConfirmation.value) {
    // Close popover and show confirmation dialog
    isPopoverOpen.value = false;
    showConfirmDialog.value = true;
    return;
  }

  // No confirmation needed, trigger sync directly
  await syncStatus.triggerSync(true);
  // Keep popover open to show sync progress
};

const confirmSync = async () => {
  showConfirmDialog.value = false;
  await syncStatus.triggerSync(true); // Skip confirmation
  // Reopen popover to show sync progress
  isPopoverOpen.value = true;
};

watch(route, () => {
  isMobileSheetOpen.value = false;
});
</script>
