<script setup lang="ts">
import { AccountGroups } from '@/common/types/models';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { useDeleteAccountGroup } from '@/composable/data-queries/account-groups';
import { Trash2Icon } from '@lucide/vue';
import { ref } from 'vue';

const props = defineProps<{ group: AccountGroups }>();

const isConfirmOpen = ref(false);

const { mutate: removeGroup, isPending } = useDeleteAccountGroup({
  groupId: () => props.group.id,
  onSuccess: () => {
    isConfirmOpen.value = false;
  },
});
</script>

<template>
  <Button variant="soft-destructive" size="sm" :disabled="isPending" @click="isConfirmOpen = true">
    <Trash2Icon class="size-4" />
    {{ $t('settings.accountGroups.delete.button') }}
  </Button>

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
