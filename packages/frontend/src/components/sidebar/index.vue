<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';

import AccountsView from './accounts-view/index.vue';
import FeedbackDialog from './feedback-dialog.vue';
import LogounButton from './logout-button.vue';
import NavigationLinks from './navigation-links.vue';

defineProps<{ mobileView?: boolean }>();
</script>

<template>
  <component :is="mobileView ? 'div' : Card" class="flex h-full w-75 flex-col rounded-none max-md:w-auto">
    <CardHeader class="h-13 px-4 py-3">
      <div class="text-lg font-medium">MoneyMatter</div>
    </CardHeader>
    <CardContent class="flex max-h-[calc(100%-52px)] grow flex-col gap-2 px-4 pt-0 pb-3 sm:p-2">
      <nav class="grid gap-1">
        <NavigationLinks />
      </nav>

      <hr class="bg-border h-px w-full" />

      <AccountsView />

      <hr class="bg-border h-px w-full" />
      <FeedbackDialog />
      <LogounButton />
    </CardContent>
  </component>
</template>
