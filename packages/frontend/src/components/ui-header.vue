<template>
  <div class="shadow-header border-border flex max-h-(--header-height) items-center justify-between border-b px-6 py-3">
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

      <component :is="isMobileView ? ManageTransactionDrawer : ManageTransactionDialog">
        <Button variant="default" :size="isMobileView ? 'default' : 'lg'">
          <span class="hidden md:block"> New Transaction </span>
          <span class="flex items-center gap-1 md:hidden"> <PlusIcon class="size-5" /> Add </span>
        </Button>
      </component>
    </div>

    <div class="ml-auto flex items-center gap-2">
      <Button variant="ghost" size="icon" @click="toggleTheme">
        <template v-if="currentTheme === Themes.dark">
          <MoonStar :size="20" />
        </template>
        <template v-else>
          <Sun :size="20" />
        </template>
      </Button>

      <Popover.Popover v-model:open="isPopoverOpen">
        <Popover.PopoverTrigger as-child>
          <Button variant="ghost" class="flex items-center gap-2" size="sm">
            <template v-if="syncStatus.isSyncing.value">
              <RefreshCcw class="animate-spin" :size="16" />
              <span class="font-medium">{{ syncStatus.syncingSummaryText.value || 'Synchronizing...' }}</span>
            </template>
            <template v-else>
              <CheckCircle :size="14" class="text-green-700" />
              <span class="xs:block hidden font-medium"> Synchronized </span>
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

      <router-link :to="{ name: ROUTES_NAMES.settings }">
        <Button variant="secondary" class="text-white" size="icon" as="span">
          <SettingsIcon :color="currentTheme === Themes.light ? 'black' : undefined" />
        </Button>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Themes, currentTheme, toggleTheme } from '@/common/utils';
import ManageTransactionDrawer from '@/components/dialogs/manage-transaction/drawer-view.vue';
import ManageTransactionDialog from '@/components/dialogs/manage-transaction/index.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import * as Sheet from '@/components/lib/ui/sheet';
import Sidebar from '@/components/sidebar/index.vue';
import SyncConfirmationDialog from '@/components/sync-confirmation-dialog.vue';
import SyncStatusTooltip from '@/components/sync-status-tooltip.vue';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { useSyncStatus } from '@/composable/use-sync-status';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ROUTES_NAMES } from '@/routes';
import { CheckCircle, MenuIcon, MoonStar, PlusIcon, RefreshCcw, SettingsIcon, Sun } from 'lucide-vue-next';
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);
const showConfirmDialog = ref(false);
const isPopoverOpen = ref(false);

// Use new sync status system
const syncStatus = useSyncStatus();

// Initialize sync status on mount
onMounted(async () => {
  await syncStatus.fetchStatus();
  // Trigger auto-sync check when app loads
  await syncStatus.checkAndAutoSync();
});

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
