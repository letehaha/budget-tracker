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
            <span class="hidden md:block">{{ $t('header.newTransaction') }}</span>
            <span class="md:hidden">{{ $t('header.add') }}</span>
          </Button>
        </ManageTransactionDialog>

        <RouterLink :to="{ name: ROUTES_NAMES.settingsDataManagement }" class="hidden md:block">
          <Button variant="secondary" size="sm" class="flex items-center gap-1">
            <ImportIcon class="size-4" />
            {{ $t('header.importData') }}
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

        <template v-if="accountsNeedingRelink.length > 0">
          <AccountsRelinkWarning />
        </template>
        <template v-else>
          <Popover.Popover v-model:open="isPopoverOpen">
            <Popover.PopoverTrigger as-child>
              <Button variant="secondary" :size="isCompactView ? 'icon' : 'sm'">
                <template v-if="syncStatus.isSyncing.value">
                  <RefreshCcw class="animate-spin" :size="16" />
                  <span class="hidden text-sm font-medium lg:inline">
                    <span class="xs:hidden">{{ $t('header.sync.syncing') }}</span>
                    <span class="xs:inline hidden">{{
                      syncStatus.syncingSummaryText.value || $t('header.sync.synchronizing')
                    }}</span>
                  </span>
                </template>
                <template v-else-if="syncStatus.syncStuck.value">
                  <AlertTriangleIcon class="text-destructive-text" :size="16" />
                  <span class="hidden text-sm font-medium lg:inline">
                    {{ $t('header.sync.stuck') }}
                  </span>
                </template>
                <template v-else-if="categorizationStatus.isCategorizing.value">
                  <SparklesIcon class="text-primary animate-pulse" :size="16" />
                  <span class="hidden text-sm font-medium lg:inline">
                    {{ $t('header.categorization.categorizing') }}
                  </span>
                </template>
                <template v-else-if="hasConnections">
                  <CloudCheckIcon class="text-success-text size-4" />
                  <span v-if="lastSyncRelativeTime" class="hidden text-sm font-medium lg:block">
                    {{ $t('header.sync.syncedTime', { time: lastSyncRelativeTime }) }}
                  </span>
                </template>
                <template v-else>
                  <CloudCheckIcon class="size-4" />
                  <span class="hidden text-sm font-medium lg:block">{{ $t('header.sync.connectBank') }}</span>
                </template>
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
import { useSyncStatus } from '@/composable/use-sync-status';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import {
  AlertTriangleIcon,
  CloudCheckIcon,
  ExternalLinkIcon,
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
import { RouterLink, useRoute } from 'vue-router';

const accountsStore = useAccountsStore();
const { accountsNeedingRelink } = storeToRefs(accountsStore);

const { elementRef: headerRef } = useCssVarFromElementSize({
  cssVars: [{ cssVarName: '--header-height' }],
});

const route = useRoute();
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);
// 1024px (lg breakpoint) - used for compact header elements
const isCompactView = useWindowBreakpoints(1024);
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
