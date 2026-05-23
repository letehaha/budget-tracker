<script setup lang="ts">
import type { AccountGroups } from '@/common/types/models';
import AccountGroupName from '@/components/common/account-group-name.vue';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { useSyncStatus } from '@/composable/use-sync-status';
import { AlertTriangleIcon, ChevronRightIcon, FolderIcon } from '@lucide/vue';
import { computed, inject, ref, watch } from 'vue';

import AccountGroupsList from './account-groups-list.vue';
import AccountsList from './accounts-list.vue';
import { useActiveAccountGroups } from './helpers/use-active-account-groups';

const props = defineProps<{
  group: AccountGroups;
}>();

const accountGroupsContext = inject<ReturnType<typeof useActiveAccountGroups>>('accountGroupsContext');

const isOpen = ref(false);
watch(
  () => accountGroupsContext!.openGroupIds.value,
  (openGroupIds) => {
    isOpen.value = openGroupIds.has(props.group.id);
  },
  { immediate: true },
);

const { groupHasReauthAccount } = useSyncStatus();

const needsReauth = computed(() => groupHasReauthAccount(props.group));
</script>

<template>
  <Collapsible v-model:open="isOpen">
    <CollapsibleTrigger class="w-full">
      <Button variant="ghost" as="div" size="default" class="w-full px-2">
        <div class="flex w-full items-center gap-2">
          <ChevronRightIcon :class="['size-4 shrink-0 transition-transform duration-200', { 'rotate-90': isOpen }]" />
          <FolderIcon v-if="!group.bankDataProviderConnectionId" class="text-muted-foreground size-4 shrink-0" />
          <AccountGroupName :group="group" class="min-w-0 text-sm" />
          <ResponsiveTooltip
            v-if="needsReauth"
            :content="$t('sidebar.accountsView.needsReauthTooltip')"
            content-class-name="max-w-64"
          >
            <AlertTriangleIcon class="text-destructive-text size-4 shrink-0" />
          </ResponsiveTooltip>
          <span class="text-muted-foreground ml-auto text-xs tabular-nums">
            {{ group.accounts.length }}
          </span>
        </div>
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="border-border/40 ml-2 border-l pl-2">
        <AccountsList :accounts="group.accounts" />
        <AccountGroupsList v-if="group.childGroups.length" :groups="group.childGroups" />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
