<script setup lang="ts">
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_STATUSES, AccountModel } from '@bt/shared/types';
import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  account: AccountModel;
}>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();

const isArchiveDialogOpen = ref(false);
const alsoExcludeFromStats = ref(true);
const isLoading = ref(false);

const isArchived = computed(() => props.account.status === ACCOUNT_STATUSES.archived);
const hasBankConnection = computed(() => typeof props.account.bankDataProviderConnectionId === 'number');

const archiveAccount = async () => {
  isLoading.value = true;
  try {
    await accountsStore.editAccount({
      id: props.account.id,
      status: ACCOUNT_STATUSES.archived,
      ...(alsoExcludeFromStats.value ? { excludeFromStats: true } : {}),
    });
    isArchiveDialogOpen.value = false;
    addSuccessNotification(t('pages.account.archive.success'));
  } catch {
    addErrorNotification(t('pages.account.archive.error'));
  } finally {
    isLoading.value = false;
  }
};

const unarchiveAccount = async () => {
  isLoading.value = true;
  try {
    await accountsStore.editAccount({
      id: props.account.id,
      status: ACCOUNT_STATUSES.active,
    });
    addSuccessNotification(t('pages.account.archive.unarchiveSuccess'));
  } catch {
    addErrorNotification(t('pages.account.archive.error'));
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="border-warning @container/archive mt-4 grid gap-4 rounded-xl border p-4 sm:-mx-4">
    <template v-if="!isArchived">
      <div>
        <p class="mb-2 font-bold">{{ t('pages.account.archive.title') }}</p>
        <p class="text-muted-foreground text-xs">
          {{ t('pages.account.archive.description') }}
        </p>
      </div>

      <Button variant="outline" :disabled="isLoading" :loading="isLoading" @click="isArchiveDialogOpen = true">
        <ArchiveIcon class="size-4" /> {{ t('pages.account.archive.archiveButton') }}
      </Button>

      <ResponsiveAlertDialog
        v-model:open="isArchiveDialogOpen"
        :confirm-label="t('pages.account.archive.archiveButton')"
        :confirm-disabled="isLoading"
        @confirm="archiveAccount"
      >
        <template #title>{{ t('pages.account.archive.confirmTitle') }}</template>
        <template #description>
          <p class="mb-2">
            {{ t('pages.account.archive.confirmDescription', { name: account.name }) }}
          </p>
          <ul class="text-muted-foreground list-disc pl-4 text-sm">
            <li>{{ t('pages.account.archive.effect.sidebar') }}</li>
            <li v-if="hasBankConnection">{{ t('pages.account.archive.effect.bankSync') }}</li>
          </ul>
        </template>

        <label class="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox v-model="alsoExcludeFromStats" />
          {{ t('pages.account.archive.alsoExcludeFromStats') }}
        </label>
      </ResponsiveAlertDialog>
    </template>

    <template v-else>
      <div>
        <p class="mb-2 font-bold">{{ t('pages.account.archive.archivedTitle') }}</p>
        <p class="text-muted-foreground text-xs">
          {{ t('pages.account.archive.archivedDescription') }}
        </p>
      </div>

      <Button variant="outline" :disabled="isLoading" :loading="isLoading" @click="unarchiveAccount">
        <ArchiveRestoreIcon class="size-4" /> {{ t('pages.account.archive.unarchiveButton') }}
      </Button>
    </template>
  </div>
</template>
