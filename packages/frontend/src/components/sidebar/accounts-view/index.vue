<script setup lang="ts">
import { loadAccountGroups } from '@/api/account-groups';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AccountGroups } from '@/common/types/models';
import CreateAccountGroupDialog from '@/components/dialogs/account-groups/create-account-group-dialog.vue';
import CreateAccountDialog from '@/components/dialogs/create-account-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { PlusIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, provide, ref } from 'vue';

import AccountGroupsList from './account-groups-list.vue';
import AccountsList from './accounts-list.vue';
import { useActiveAccountGroups } from './helpers/use-active-account-groups';

const { enabledAccounts } = storeToRefs(useAccountsStore());
const { data: accountGroups, isLoading } = useQuery({
  queryFn: () => loadAccountGroups(),
  queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
  staleTime: Infinity,
  placeholderData: [],
});

const accountGroupsContext = useActiveAccountGroups(accountGroups);
provide('accountGroupsContext', accountGroupsContext);

const accountsInGroups = computed(() => {
  const flattenAccounts = (groups: AccountGroups[]): Record<number, AccountModel> =>
    groups.reduce(
      (acc, group) => {
        group.accounts.forEach((account) => {
          acc[account.id] = account;
        });
        if (group.childGroups.length) {
          Object.assign(acc, flattenAccounts(group.childGroups));
        }
        return acc;
      },
      {} as Record<number, AccountModel>,
    );

  return flattenAccounts(accountGroups.value);
});
const accountsWithoutGroups = computed(() => enabledAccounts.value.filter((i) => !accountsInGroups.value[i.id]));

const isPopoverOpen = ref(false);
</script>

<template>
  <div class="my-6 grid min-w-[300px] gap-0.5 overflow-y-hidden md:-ml-3">
    <div class="ml-3 flex items-center justify-between">
      <p class="text-xs uppercase">Accounts</p>

      <Popover.Popover :open="isPopoverOpen" @update:open="isPopoverOpen = $event">
        <Popover.PopoverTrigger as-child>
          <Button size="icon" variant="secondary">
            <PlusIcon :class="['transition-transform', isPopoverOpen && '-rotate-45']" />
          </Button>
        </Popover.PopoverTrigger>
        <Popover.PopoverContent side="bottom">
          <div class="grid gap-2">
            <CreateAccountDialog @created="isPopoverOpen = false">
              <Button type="button" size="sm" variant="secondary"> New account </Button>
            </CreateAccountDialog>

            <CreateAccountGroupDialog @created="isPopoverOpen = false">
              <Button type="button" size="sm" variant="secondary"> New accounts group </Button>
            </CreateAccountGroupDialog>
          </div>
        </Popover.PopoverContent>
      </Popover.Popover>
    </div>

    <div class="grid max-h-full gap-0.5 overflow-auto">
      <template v-if="isLoading">
        <div>Loading</div>
      </template>
      <template v-else>
        <AccountGroupsList :groups="accountGroups" />
        <AccountsList :accounts="accountsWithoutGroups" />
      </template>
    </div>
  </div>
</template>
