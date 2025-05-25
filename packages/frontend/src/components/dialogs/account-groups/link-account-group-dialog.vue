<script setup lang="ts">
import { linkAccountToGroup, loadAccountGroups, removeAccountFromGroup } from '@/api/account-groups';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AccountGroups } from '@/common/types/models';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useAccountGroupForAccount } from '@/composable/data-queries/account-groups';
import { AccountModel } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { CheckIcon, PlusIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import CreateAccountGroupDialog from './create-account-group-dialog.vue';

const props = defineProps<{
  account: AccountModel;
}>();
const isOpen = ref(false);

const selectedGroup = ref<AccountGroups>(null);

const queryClient = useQueryClient();
const { data } = useQuery({
  queryFn: () => loadAccountGroups(),
  queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
  staleTime: Infinity,
});

const accountId = ref(props.account.id);

const { data: currentSelection, invalidate: invalidateAccountGroup } = useAccountGroupForAccount(accountId, {
  enabled: () => isOpen.value,
});

watch(
  () => props.account.id,
  (newAccountId) => {
    accountId.value = newAccountId;
  },
  { immediate: true },
);

watch(
  currentSelection,
  (v) => {
    selectedGroup.value = v;
  },
  { immediate: true },
);

const { isPending: isLinkingAccount, mutate: linkAccount } = useMutation({
  mutationFn: linkAccountToGroup,
  onSuccess: () => {
    invalidateAccountGroup();
    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
    });
    isOpen.value = false;
  },
});
const { isPending: isUnlinkingAccount, mutate: unlinkAccount } = useMutation({
  mutationFn: removeAccountFromGroup,
  onSuccess: () => {
    invalidateAccountGroup();
    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
    });
    isOpen.value = false;
  },
});

const isFormPending = computed(() => isLinkingAccount.value || isUnlinkingAccount.value);

const saveChanges = () => {
  if (selectedGroup.value) {
    linkAccount({
      accountId: props.account.id,
      groupId: selectedGroup.value.id,
    });
  } else {
    unlinkAccount({
      accountIds: [props.account.id],
      groupId: currentSelection.value.id,
    });
  }
};

const handleSelection = (group: AccountGroups) => {
  selectedGroup.value = selectedGroup.value?.id === group.id ? null : group;
};

const isGroupChanged = computed(() => currentSelection.value?.name !== selectedGroup.value?.name);
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>
    <template #title> Link account group </template>

    <div class="grid gap-1">
      <template v-for="group of data" :key="group.id">
        <UiButton
          variant="ghost"
          class="w-full justify-between"
          :disabled="isFormPending"
          @click="() => handleSelection(group)"
        >
          {{ group.name }}

          <template v-if="group.id === selectedGroup?.id">
            <CheckIcon class="text-primary size-5" />
          </template>
        </UiButton>
      </template>
    </div>

    <div class="mt-8">
      <template v-if="isGroupChanged">
        <div class="grid grid-cols-2 gap-2">
          <UiButton variant="secondary" :disabled="isFormPending" @click="selectedGroup = currentSelection">
            Cancel
          </UiButton>
          <UiButton :disabled="isFormPending" @click="saveChanges"> Save </UiButton>
        </div>
      </template>
      <template v-else>
        <CreateAccountGroupDialog>
          <UiButton variant="secondary" class="w-full gap-2">
            Create new group
            <PlusIcon class="size-5" />
          </UiButton>
        </CreateAccountGroupDialog>
      </template>
    </div>
  </ResponsiveDialog>
</template>
