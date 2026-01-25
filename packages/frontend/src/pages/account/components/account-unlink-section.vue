<script setup lang="ts">
import { AlertDialog } from '@/components/common';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  account: AccountModel;
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const { t } = useI18n();
const confirmAccountName = ref('');
const isAccountUnlinking = ref(false);

const isAccountLinkedToBank = computed(() => !!props.account.bankDataProviderConnectionId);

const unlinkAccount = async () => {
  const accountName = props.account.name;

  if (confirmAccountName.value !== accountName) return;

  isAccountUnlinking.value = true;

  try {
    await accountsStore.unlinkAccountFromBankConnection({
      id: props.account.id,
    });
    addSuccessNotification(t('pages.account.unlink.success', { accountName }));
    confirmAccountName.value = '';
  } catch {
    addErrorNotification(t('pages.account.unlink.error'));
    isAccountUnlinking.value = false;
  }
};
</script>

<template>
  <div
    v-if="isAccountLinkedToBank"
    class="flex flex-col justify-between gap-2 @[400px]/danger-zone:flex-row @[400px]/danger-zone:items-center"
  >
    <div>
      <p class="mb-2 font-bold">{{ t('pages.account.unlink.title') }}</p>
      <p class="text-xs">
        {{ t('pages.account.unlink.description') }}
        <br />
        <b>{{ t('pages.account.unlink.autoSyncWarning') }}</b>
        {{ t('pages.account.unlink.manualUpdatesOnly') }}
        <br />
        <b class="text-green-600">{{ t('pages.account.unlink.note') }}</b> {{ t('pages.account.unlink.reconnectionInfo') }}
      </p>
    </div>

    <AlertDialog
      :title="t('pages.account.unlink.confirmTitle')"
      :accept-disabled="confirmAccountName !== account.name"
      accept-variant="destructive"
      @accept="unlinkAccount"
    >
      <template #trigger>
        <Button variant="outline" :disable="isAccountUnlinking">
          <template v-if="isAccountUnlinking"> {{ t('pages.account.unlink.unlinkingButton') }} </template>
          <template v-else> {{ t('pages.account.unlink.unlinkButton') }} </template>
        </Button>
      </template>
      <template #description>
        <p class="mb-2">
          {{ t('pages.account.unlink.dialogDescription') }}
        </p>
        <p class="mb-2">
          <strong>{{ t('pages.account.unlink.whatWillHappen') }}</strong>
        </p>
        <ul class="mb-3 ml-4 list-disc text-sm">
          <li>{{ t('pages.account.unlink.willBecomeSystemType') }}</li>
          <li>{{ t('pages.account.unlink.transactionsPreserved') }}</li>
          <li>{{ t('pages.account.unlink.syncWillStop') }}</li>
          <li>{{ t('pages.account.unlink.connectionHistorySaved') }}</li>
        </ul>
        <p class="text-sm text-green-600">
          <strong>{{ t('pages.account.unlink.note') }}</strong> {{ t('pages.account.unlink.reconnectionInfo') }}
        </p>
      </template>
      <template #content>
        <p class="mb-2 text-sm">{{ t('pages.account.unlink.confirmAccountName') }}</p>
        <InputField
          v-model="confirmAccountName"
          :placeholder="$t('pages.account.unlink.confirmPlaceholder')"
          class="border-destructive focus-visible:outline-destructive"
        />
      </template>
    </AlertDialog>
  </div>
</template>
