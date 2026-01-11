<template>
  <div ref="headerRef" class="shadow-header border-border flex items-center justify-between border-b px-6 py-3">
    <div class="flex items-center gap-4">
      <template v-if="isMobileView">
        <Sheet.Sheet :open="isMobileSheetOpen" @update:open="isMobileSheetOpen = $event">
          <Sheet.SheetTrigger as-child>
            <Button size="icon" variant="secondary" class="shrink-0">
              <MenuIcon class="size-5" />
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
        <Button variant="default" class="flex items-center gap-1">
          <PlusIcon class="size-5" />
          <span class="hidden md:block">{{ $t('header.newTransaction') }}</span>
          <span class="md:hidden">{{ $t('header.add') }}</span>
        </Button>
      </ManageTransactionDialog>
    </div>

    <div class="ml-auto flex items-center gap-2">
      <!-- Theme toggle temporarily disabled - light theme coming soon
      <Button variant="ghost" size="icon" @click="toggleTheme">
        <template v-if="currentTheme === Themes.dark">
          <MoonStar :size="20" />
        </template>
        <template v-else>
          <Sun :size="20" />
        </template>
      </Button>
      -->

      <template v-if="accountsNeedingRelink.length > 0">
        <AccountsRelinkWarning />
      </template>
      <template v-else>
        <Popover.Popover v-model:open="isPopoverOpen">
          <Popover.PopoverTrigger as-child>
            <Button variant="secondary" :size="isCompactView ? 'icon' : 'default'">
              <template v-if="syncStatus.isSyncing.value">
                <RefreshCcw class="animate-spin" :size="16" />
                <span class="hidden font-medium lg:inline">
                  <span class="xs:hidden">{{ $t('header.sync.syncing') }}</span>
                  <span class="xs:inline hidden">{{
                    syncStatus.syncingSummaryText.value || $t('header.sync.synchronizing')
                  }}</span>
                </span>
              </template>
              <template v-else-if="hasConnections">
                <CloudCheckIcon class="text-success-text size-5" />
                <span v-if="lastSyncRelativeTime" class="hidden font-medium lg:block">
                  {{ $t('header.sync.syncedTime', { time: lastSyncRelativeTime }) }}
                </span>
              </template>
              <template v-else>
                <CloudCheckIcon class="size-5" />
                <span class="hidden font-medium lg:block">{{ $t('header.sync.connectBank') }}</span>
              </template>
            </Button>
          </Popover.PopoverTrigger>
          <Popover.PopoverContent class="w-auto p-0" align="end">
            <SyncStatusTooltip
              :account-statuses="syncStatus.accountStatuses.value"
              :sync-progress="syncStatus.syncProgress.value"
              :last-sync-timestamp="syncStatus.lastSyncTimestamp.value"
              :is-loading="syncStatus.isLoading.value"
              :is-syncing="syncStatus.isSyncing.value"
              :show-success-message="syncStatus.showSuccessMessage.value"
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

      <!-- Language Switcher -->
      <LanguageSelector variant="secondary" show-header persist-to-backend />

      <router-link :to="{ name: ROUTES_NAMES.settings }">
        <Button variant="secondary" class="text-white" size="icon" as="span">
          <SettingsIcon />
        </Button>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
// Theme toggle temporarily disabled - light theme coming soon
// import { Themes, currentTheme, toggleTheme } from '@/common/utils';
import AccountsRelinkWarning from '@/components/accounts-relink-warning.vue';
import LanguageSelector from '@/components/common/language-selector.vue';
import ManageTransactionDialog from '@/components/dialogs/manage-transaction/index.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import * as Sheet from '@/components/lib/ui/sheet';
import NotificationsPopover from '@/components/notifications-popover/index.vue';
import Sidebar from '@/components/sidebar/index.vue';
import SyncConfirmationDialog from '@/components/sync-confirmation-dialog.vue';
import SyncStatusTooltip from '@/components/sync-status-tooltip.vue';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { useCssVarFromElementSize } from '@/composable/use-css-var-from-element-size';
import { useDateLocale } from '@/composable/use-date-locale';
import { useSyncStatus } from '@/composable/use-sync-status';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ROUTES_NAMES } from '@/routes';
import { useAccountsStore } from '@/stores';
// MoonStar, Sun removed - theme toggle temporarily disabled
import { CloudCheckIcon, MenuIcon, PlusIcon, RefreshCcw, SettingsIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

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

// Use new sync status system
const syncStatus = useSyncStatus();

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
