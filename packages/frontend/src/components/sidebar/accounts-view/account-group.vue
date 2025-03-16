<script setup lang="ts">
import type { AccountGroups } from '@/common/types/models';
import Button from '@/components/lib/ui/button/Button.vue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { ChevronDown } from 'lucide-vue-next';
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
  () => accountGroupsContext.openGroupIds.value,
  (openGroupIds) => {
    isOpen.value = openGroupIds.has(props.group.id);
  },
  { immediate: true },
);
</script>

<template>
  <Collapsible v-model:open="isOpen">
    <CollapsibleTrigger class="w-full">
      <Button variant="ghost" as="div" size="default" class="w-full h-[56px]">
        <div class="flex justify-between items-center w-full">
          <span class="text-sm"> {{ group.name }} ({{ group.accounts.length }}) </span>
          <ChevronDown :class="{ 'rotate-180': isOpen }" class="w-4 h-4 transition-transform" />
        </div>
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="pl-4 pt-0.5">
        <AccountsList :accounts="group.accounts" />
        <AccountGroupsList v-if="group.childGroups.length" :groups="group.childGroups" />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
