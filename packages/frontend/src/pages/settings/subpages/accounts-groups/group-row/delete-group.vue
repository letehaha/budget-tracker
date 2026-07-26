<script setup lang="ts">
import { AccountGroups } from '@/common/types/models';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useDeleteAccountGroup } from '@/composable/data-queries/account-groups';
import { Trash2Icon } from '@lucide/vue';
import { computed, ref } from 'vue';

const props = defineProps<{ group: AccountGroups }>();

const isConfirmOpen = ref(false);

// The backend refuses to delete a group it created for a bank connection — removing it
// means disconnecting the bank.
const isBankLinked = computed(() => !!props.group.bankDataProviderConnectionId);

const { mutate: removeGroup, isPending } = useDeleteAccountGroup({
  groupId: () => props.group.id,
  onSuccess: () => {
    isConfirmOpen.value = false;
  },
});
</script>

<template>
  <DesktopOnlyTooltip
    :content="$t('settings.accountGroups.delete.disabledTooltip')"
    :disabled="!isBankLinked"
    content-class-name="max-w-80"
  >
    <!-- Disabled native buttons don't fire pointer events, so the tooltip trigger
    (merged onto this child via as-child) needs a non-disabled wrapper to hover on. -->
    <span class="inline-flex">
      <Button variant="soft-destructive" size="sm" :disabled="isBankLinked || isPending" @click="isConfirmOpen = true">
        <Trash2Icon class="size-4" />
        {{ $t('settings.accountGroups.delete.button') }}
      </Button>
    </span>
  </DesktopOnlyTooltip>

  <ResponsiveAlertDialog
    v-model:open="isConfirmOpen"
    :confirm-label="$t('settings.accountGroups.delete.button')"
    confirm-variant="destructive"
    :confirm-disabled="isPending"
    @confirm="removeGroup()"
  >
    <template #title>{{ $t('settings.accountGroups.delete.confirmTitle') }}</template>
    <template #description>
      <p>{{ $t('settings.accountGroups.delete.description') }}</p>

      <template v-if="group.accounts.length">
        <p class="mt-3">{{ $t('settings.accountGroups.delete.affectedAccounts') }}</p>
        <ul class="mt-1 list-inside list-disc">
          <li v-for="account in group.accounts" :key="account.id">{{ account.name }}</li>
        </ul>
      </template>
    </template>
  </ResponsiveAlertDialog>
</template>
