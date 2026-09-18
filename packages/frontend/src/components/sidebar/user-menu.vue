<script setup lang="ts">
import { config } from '@/common/config';
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { useLogout } from '@/composable/actions/logout';
import { ROUTES_NAMES } from '@/routes/constants';
import { useUserStore } from '@/stores';
import { ChevronUpIcon, ExternalLinkIcon, LogOutIcon, UserIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { user } = storeToRefs(useUserStore());
const logoutHandler = useLogout();
const isOpen = ref(false);
const appRelease = __APP_RELEASE__;
const commitHash = __APP_VERSION__;
// Builds without git (no CI hash, no .git) fall back to a `dev-<timestamp>` id that isn't a commit.
const isRealCommit = /^[0-9a-f]{40}$/.test(commitHash);
</script>

<template>
  <Popover.Popover v-model:open="isOpen">
    <Popover.PopoverTrigger as-child>
      <button class="hover:bg-accent flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors">
        <div
          class="bg-primary/20 text-primary-text flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
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

  <div v-if="config.isSelfHost" class="flex items-center justify-between gap-2 px-3 text-xs">
    <i18n-t keypath="navigation.appVersion" tag="span" class="text-muted-foreground truncate">
      <template #version>
        <span class="text-foreground font-medium">{{ appRelease }}</span>
      </template>
    </i18n-t>
    <a
      v-if="isRealCommit"
      :href="`https://github.com/letehaha/budget-tracker/commit/${commitHash}`"
      target="_blank"
      rel="noopener noreferrer"
      class="bg-muted hover:bg-accent text-foreground flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono transition-colors"
    >
      {{ commitHash.slice(0, 7) }}
      <ExternalLinkIcon class="size-3" />
    </a>
  </div>
</template>
