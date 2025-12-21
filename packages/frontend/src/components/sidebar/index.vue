<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';

import AccountsView from './accounts-view/index.vue';
import LogounButton from './logout-button.vue';
import NavigationLinks from './navigation-links.vue';

defineProps<{ mobileView?: boolean }>();
</script>

<template>
  <component :is="mobileView ? 'div' : Card" class="flex h-full flex-col rounded-none">
    <CardHeader class="h-[52px] sm:py-3">
      <div class="text-lg font-medium">MoneyMatter</div>
    </CardHeader>
    <CardContent class="flex max-h-[calc(100%-52px)] grow flex-col px-3 md:px-6">
      <nav class="grid gap-2 md:-ml-3">
        <NavigationLinks />
      </nav>

      <AccountsView />

      <LogounButton />
    </CardContent>
  </component>
</template>
