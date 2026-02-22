<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { useLogout } from '@/composable/actions/logout';
import { ROUTES_NAMES } from '@/routes/constants';
import { useUserStore } from '@/stores';
import { ChevronUpIcon, LogOutIcon, UserIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { user } = storeToRefs(useUserStore());
const logoutHandler = useLogout();
const isOpen = ref(false);
</script>

<template>
  <Popover.Popover v-model:open="isOpen">
    <Popover.PopoverTrigger as-child>
      <button class="hover:bg-accent flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors">
        <div
          class="bg-primary/20 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        >
          {{ user?.email?.charAt(0).toUpperCase() || '?' }}
        </div>
        <span class="text-muted-foreground min-w-0 flex-1 truncate text-sm">
          {{ user?.email || 'User' }}
        </span>
        <ChevronUpIcon
          :class="['text-muted-foreground size-4 shrink-0 transition-transform', isOpen && 'rotate-180']"
        />
      </button>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent side="top" align="start" class="w-56 p-1">
      <router-link :to="{ name: ROUTES_NAMES.settingsSecurity }" @click="isOpen = false">
        <UiButton variant="ghost" class="w-full justify-start gap-2 px-3" size="default">
          <UserIcon class="size-4" />
          <span>{{ t('navigation.accountDetails') }}</span>
        </UiButton>
      </router-link>

      <UiButton
        variant="ghost-destructive"
        class="w-full justify-start gap-2 px-3"
        size="default"
        @click="
          logoutHandler();
          isOpen = false;
        "
      >
        <LogOutIcon class="size-4" />
        <span>{{ $t('navigation.logout') }}</span>
      </UiButton>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>
