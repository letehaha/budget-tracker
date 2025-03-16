<script setup lang="ts">
import {
  deleteAccountGroup,
  loadAccountGroups,
  removeAccountFromGroup,
  updateAccountGroup,
} from '@/api/account-groups';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AccountGroups } from '@/common/types/models';
import { AlertDialog } from '@/components/common';
import { InputField } from '@/components/fields';
import Button from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable';
import { ROUTES_NAMES } from '@/routes';
import { AccountModel } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ChevronRight, EditIcon, SaveIcon, Trash2Icon, UngroupIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';

type ActiveItemIndex = number;

const activeItemIndex = ref<ActiveItemIndex>(null);
const selectedGroup = ref<AccountGroups>(null);
const activeEditName = ref<string>('');
const openNameEditor = ref<Record<number, boolean>>({});
const toggledListItem = ref([]);
const deletedElements = ref<AccountModel[]>(null);
const queryClient = useQueryClient();
const toggledAccountId = ref<number>();
const { formatAmountByCurrencyId } = useFormatCurrency();

const { addSuccessNotification } = useNotificationCenter();

const { data: accountGroups } = useQuery({
  queryFn: () => loadAccountGroups(),
  queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
  staleTime: Infinity,
  placeholderData: [],
});

const { mutate: updateGroupMutation } = useMutation({
  mutationFn: updateAccountGroup,
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
    });
  },
});

const { isPending: isUnlinkingAccount, mutate: unlinkAccount } = useMutation({
  mutationFn: removeAccountFromGroup,
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
    });
    addSuccessNotification('Account has been unlinked');
  },
});

const { mutate: deleteAccountMutation } = useMutation({
  mutationFn: deleteAccountGroup,
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
    });
    addSuccessNotification('Group has been deleted');
  },
});

const isFormPending = computed(() => isUnlinkingAccount.value);

const toggleActiveItem = (group: AccountGroups, index: ActiveItemIndex) => {
  toggledListItem[index] = index;
  activeItemIndex.value = activeItemIndex.value === index ? null : index;
  selectedGroup.value = group;
  toggledListItem[index] = !toggledListItem[index];
};

const toggleGroupNameEdit = (index: ActiveItemIndex, group: AccountGroups) => {
  openNameEditor.value[index] = true;
  activeEditName.value = group.name;
};

const toggleDelete = (group: AccountGroups) => {
  deletedElements.value = group.accounts;
};

const updateGroup = async (group: AccountGroups, index: ActiveItemIndex) => {
  const newName = activeEditName.value.trim();

  if (newName && group.name !== newName) {
    await updateGroupMutation({
      groupId: group.id,
      updates: { name: newName },
    });
  }
  openNameEditor.value[index] = false;
  activeItemIndex.value = null;
};

const deleteAccount = async (group: AccountGroups) => {
  await deleteAccountMutation({
    userId: group.userId,
    groupId: group.id,
  });
};

const onRowClick = (group: AccountGroups, index: number) => {
  if (group.accounts.length) {
    toggleActiveItem(group, index);
  }
};

const unlinkAccountFromGroup = (id: number) => {
  toggledAccountId.value = id;
  if (selectedGroup.value) {
    unlinkAccount({ accountIds: [id], groupId: selectedGroup.value.id });
  }
};
</script>

<template>
  <div>
    <template v-if="accountGroups.length">
      <div class="grid gap-3 @container/accounts-groups">
        <template v-for="(group, index) in accountGroups" :key="group.id">
          <div
            :class="[
              'grid grid-cols-[minmax(0,1fr),max-content] gap-4 items-center rounded py-2 pr-4 hover:bg-accent hover:text-accent-foreground',
              group.accounts.length && 'cursor-pointer',
            ]"
            @click="onRowClick(group, index)"
          >
            <div class="flex items-center gap-2">
              <div class="size-4">
                <template v-if="group.accounts.length">
                  <ChevronRight :class="['size-4 opacity-50 shrink-0', { 'rotate-90': activeItemIndex === index }]" />
                </template>
              </div>

              <template v-if="openNameEditor[index]">
                <InputField v-model="activeEditName" autofocus placeholder="Account name" class="w-full" @click.stop />
              </template>
              <template v-else>
                <span class="whitespace-nowrap text-ellipsis overflow-hidden w-min">
                  {{ group.name }}
                </span>
                <template v-if="group.accounts.length"> ({{ group.accounts.length }}) </template>
              </template>
            </div>

            <div class="flex justify-end gap-2">
              <template v-if="openNameEditor[index]">
                <Button
                  variant="default"
                  size="sm"
                  class="@[360px]/accounts-groups:min-w-[130px] gap-1"
                  aria-label="Save"
                  @click.stop.prevent="updateGroup(group, index)"
                >
                  <span class="hidden @[360px]/accounts-groups:inline"> Save </span>
                  <SaveIcon class="size-4" />
                </Button>
              </template>
              <template v-else>
                <Button
                  variant="default"
                  size="sm"
                  class="w-min gap-1"
                  :aria-label="'Edit'"
                  @click.stop="toggleGroupNameEdit(index, group)"
                >
                  <span class="hidden @[360px]/accounts-groups:inline"> Edit </span>
                  <EditIcon class="size-4" />
                </Button>

                <AlertDialog
                  title="Do you want to delete this account group?"
                  :accept-disabled="!!deletedElements?.length"
                  accept-variant="destructive"
                  @accept="deleteAccount(group)"
                >
                  <template #trigger>
                    <Button variant="destructive" size="sm" class="w-min gap-1" @click.stop="toggleDelete(group)">
                      <span class="hidden @[360px]/accounts-groups:inline"> Delete </span>
                      <Trash2Icon class="size-4" />
                    </Button>
                  </template>
                  <template #description>
                    <div v-if="deletedElements.length">
                      <div class="text-sm mb-2">Before deletion please unlink accounts listed below</div>
                      <div v-for="item in deletedElements" :key="item.id" class="text-sm px-4 py-2">
                        - {{ item.name }}
                      </div>
                    </div>
                  </template>
                </AlertDialog>
              </template>
            </div>
          </div>

          <template v-if="activeItemIndex === index">
            <div class="border-b pb-2">
              <div class="ml-3">
                <template v-for="account in group.accounts" :key="account.id">
                  <div class="flex justify-between items-center gap-4 px-4 py-2 w-full">
                    <div class="flex items-center gap-2">
                      <router-link
                        :to="{
                          name: ROUTES_NAMES.account,
                          params: { id: account.id },
                        }"
                        class="text-primary underline hover:no-underline"
                      >
                        {{ account.name }}
                      </router-link>
                      <span class="text-sm">
                        ({{ formatAmountByCurrencyId(account.currentBalance, account.currencyId) }})
                      </span>
                    </div>

                    <Button
                      size="sm"
                      :disabled="isFormPending"
                      class="gap-1"
                      variant="destructive"
                      @click="unlinkAccountFromGroup(account.id)"
                    >
                      <span class="hidden @[360px]/accounts-groups:inline"> Unlink </span>
                      <UngroupIcon class="size-4" />
                    </Button>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </template>
      </div>
    </template>
    <template v-else>
      <div class="min-w-full w-full bg-card rounded-md px-6 py-4 text-center">No group account data</div>
    </template>
  </div>
</template>
