<template>
  <div class="page">
    <template v-if="!isMobileView">
      <Sidebar />
    </template>

    <ScrollArea class="page__wrapper">
      <ui-header class="sticky top-0 z-10 bg-background" />

      <template v-if="isAppInitialized">
        <router-view />
      </template>

      <ScrollBar />
    </ScrollArea>
  </div>
</template>

<script lang="ts" setup>
import { ScrollArea, ScrollBar } from '@/components/lib/ui/scroll-area';
import Sidebar from '@/components/sidebar/index.vue';
import UiHeader from '@/components/ui-header.vue';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ROUTES_NAMES } from '@/routes/constants';
import { useCurrenciesStore, useRootStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { watch } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const rootStore = useRootStore();
const userCurrenciesStore = useCurrenciesStore();
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile, {
  wait: 50,
});

const { isAppInitialized } = storeToRefs(rootStore);
const { isBaseCurrencyExists } = storeToRefs(userCurrenciesStore);

watch(isAppInitialized, (value) => {
  if (value && !isBaseCurrencyExists.value) {
    router.push({ name: ROUTES_NAMES.welcome });
  }
});
</script>

<style lang="scss" scoped>
.page {
  display: flex;
  background-color: var(--background);
  height: 100dvh;
}
.page__wrapper {
  flex: 1;
}
</style>
