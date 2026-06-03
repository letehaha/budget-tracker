<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';

import AccountsView from './accounts-view/index.vue';
import NavigationLinks from './navigation-links.vue';
import UserMenu from './user-menu.vue';

defineProps<{ mobileView?: boolean }>();
</script>

<template>
  <component :is="mobileView ? 'div' : Card" class="flex h-full w-75 flex-col rounded-none max-md:w-auto">
    <CardHeader class="h-14 px-4 py-3">
      <div class="text-lg font-semibold tracking-tight">MoneyMatter</div>
    </CardHeader>
    <CardContent class="flex max-h-[calc(100%-56px)] grow flex-col gap-3 px-3 pt-0 pb-3 sm:p-3 sm:pt-0">
      <nav class="grid gap-0.5">
        <NavigationLinks />
      </nav>

      <div class="bg-border/50 mx-1 h-px" />

      <AccountsView />

      <div class="bg-border/50 mx-1 h-px" />

      <UserMenu />
    </CardContent>
  </component>
</template>
