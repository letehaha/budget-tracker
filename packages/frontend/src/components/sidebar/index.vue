<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';

import AccountsView from './accounts-view/index.vue';
import LogounButton from './logout-button.vue';
import NavigationLinks from './navigation-links.vue';

defineProps<{ mobileView?: boolean }>();
</script>

<template>
  <component :is="mobileView ? 'div' : Card" class="flex flex-col rounded-none h-full">
    <CardHeader class="sm:py-3 h-[52px]">
      <div class="text-lg font-medium">
        <span class="hidden md:block"> BudgetTracker </span>
        <span class="md:hidden"> BT </span>
      </div>
    </CardHeader>
    <CardContent class="px-3 md:px-6 flex flex-col flex-grow max-h-[calc(100%-52px)]">
      <NavigationLinks />

      <AccountsView />

      <LogounButton />
    </CardContent>
  </component>
</template>
