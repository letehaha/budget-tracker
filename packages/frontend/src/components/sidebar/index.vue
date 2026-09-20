<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { PanelLeftIcon } from '@lucide/vue';

import AccountsView from './accounts-view/index.vue';
import NavigationLinks from './navigation-links.vue';
import UserMenu from './user-menu.vue';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

defineProps<{ mobileView?: boolean }>();

const { isCollapsed } = useSidebarCollapsed();
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

      <UserMenu>
        <template #trailing>
          <DesktopOnlyTooltip v-if="!mobileView" :content="$t('sidebar.collapse')">
            <UiButton variant="ghost" size="icon-sm" :aria-label="$t('sidebar.collapse')" @click="isCollapsed = true">
              <PanelLeftIcon class="size-4" />
            </UiButton>
          </DesktopOnlyTooltip>
        </template>
      </UserMenu>
    </CardContent>
  </component>
</template>
