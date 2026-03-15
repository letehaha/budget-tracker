<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { ROUTES_NAMES } from '@/routes';
import { SettingsIcon } from 'lucide-vue-next';

import AccountsView from './accounts-view/index.vue';
import FeedbackDialog from './feedback-dialog.vue';
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

      <div class="grid gap-0.5">
        <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.settings }">
          <span
            :class="[
              'hover:bg-accent hover:text-accent-foreground inline-flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
              isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground',
            ]"
          >
            <SettingsIcon class="size-4 shrink-0" />
            <span>{{ $t('navigation.settings') }}</span>
          </span>
        </router-link>

        <FeedbackDialog />
      </div>

      <div class="bg-border/50 mx-1 h-px" />

      <UserMenu />
    </CardContent>
  </component>
</template>
