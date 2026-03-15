<script setup lang="ts">
import type { AccountGroups } from '@/common/types/models';
import Button from '@/components/lib/ui/button/Button.vue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { ChevronRightIcon, FolderIcon } from 'lucide-vue-next';
import { inject, ref, watch } from 'vue';

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
</script>

<template>
  <Collapsible v-model:open="isOpen">
    <CollapsibleTrigger class="w-full">
      <Button variant="ghost" as="div" size="default" class="w-full px-2">
        <div class="flex w-full items-center gap-2">
          <ChevronRightIcon :class="['size-4 shrink-0 transition-transform duration-200', { 'rotate-90': isOpen }]" />
          <FolderIcon class="text-muted-foreground size-4 shrink-0" />
          <span class="truncate text-sm">{{ group.name }}</span>
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
