<template>
  <div class="bg-background flex h-screen max-md:flex-col">
    <template v-if="!isMobileView">
      <Sidebar />
    </template>

    <ScrollArea ref="scrollAreaRef" class="flex-1">
      <ui-header class="bg-background sticky top-0 z-10" />

      <template v-if="isAppInitialized">
        <router-view />
      </template>

      <ScrollBar />
    </ScrollArea>

    <template v-if="isMobileView">
      <BottomNavbar />
    </template>
  </div>
</template>

<script lang="ts" setup>
import BottomNavbar from '@/components/bottom-navbar.vue';
import { ScrollArea, ScrollBar } from '@/components/lib/ui/scroll-area';
import Sidebar from '@/components/sidebar/index.vue';
import UiHeader from '@/components/ui-header.vue';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ROUTES_NAMES } from '@/routes/constants';
import { useCurrenciesStore, useRootStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();
const rootStore = useRootStore();
const userCurrenciesStore = useCurrenciesStore();
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile, {
  wait: 50,
});

const scrollAreaRef = ref<typeof ScrollArea>(null);

watch(
  () => route.fullPath,
  () => {
    if (scrollAreaRef.value?.viewportRef.viewportElement) {
      scrollAreaRef.value.viewportRef.viewportElement.scrollTop = 0;
    }
  },
);

const { isAppInitialized } = storeToRefs(rootStore);
const { isBaseCurrencyExists } = storeToRefs(userCurrenciesStore);

watch(isAppInitialized, (value) => {
  if (value && !isBaseCurrencyExists.value) {
    router.push({ name: ROUTES_NAMES.welcome });
  }
});
</script>
