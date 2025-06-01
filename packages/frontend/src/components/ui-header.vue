<template>
  <div
    class="shadow-header border-border flex max-h-[var(--header-height)] items-center justify-between border-b px-6 py-3"
  >
    <div class="flex items-center gap-4">
      <template v-if="isMobileView">
        <Sheet.Sheet :open="isMobileSheetOpen" @update:open="isMobileSheetOpen = $event">
          <Sheet.SheetTrigger as-child>
            <Button size="icon" variant="secondary" class="flex-shrink-0">
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

      <ui-tooltip
        :content="!isAllowedToSyncFinancialData ? 'You can sync data only once in 30 mins' : ''"
        position="bottom"
      >
        <Button
          variant="ghost"
          class="flex items-center gap-2"
          size="sm"
          :disabled="!isAllowedToSyncFinancialData"
          @click="syncFinancialDataHandler"
        >
          <template v-if="isSyncing">
            <RefreshCcw />
            <span class="font-medium">Synchronizing...</span>
          </template>
          <template v-else>
            <CheckCircle :size="14" class="text-green-700" />
            <span class="xs:block hidden font-medium"> Synchronized </span>
          </template>
        </Button>
      </ui-tooltip>

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
import UiTooltip from '@/components/common/tooltip.vue';
import ManageTransactionDrawer from '@/components/dialogs/manage-transaction/drawer-view.vue';
import ManageTransactionDialog from '@/components/dialogs/manage-transaction/index.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Sheet from '@/components/lib/ui/sheet';
import Sidebar from '@/components/sidebar/index.vue';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ROUTES_NAMES } from '@/routes';
import { useRootStore } from '@/stores';
import { CheckCircle, MenuIcon, MoonStar, PlusIcon, RefreshCcw, SettingsIcon, Sun } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const rootStore = useRootStore();
const { isAppInitialized, isFinancialDataSyncing, isAllowedToSyncFinancialData } = storeToRefs(rootStore);

const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const isSyncing = computed(() => !isAppInitialized.value || isFinancialDataSyncing.value);

const syncFinancialDataHandler = () => {
  if (isAllowedToSyncFinancialData.value) {
    rootStore.syncFinancialData();
  }
};

watch(route, () => {
  isMobileSheetOpen.value = false;
});
</script>
