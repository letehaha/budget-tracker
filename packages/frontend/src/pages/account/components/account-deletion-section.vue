<script setup lang="ts">
import { AlertDialog, ClickToCopy } from '@/components/common';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes';
import { useAccountsStore } from '@/stores';
import { AccountModel, TransactionModel } from '@bt/shared/types';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const props = defineProps<{
  account: AccountModel;
  transactions: TransactionModel[];
}>();
const router = useRouter();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const { t } = useI18n();
const confirmAccountName = ref('');
const accountHasTransactions = computed(() => props.transactions.length > 0);

const deleteAccount = async () => {
  const accountName = props.account.name;

  if (confirmAccountName.value !== accountName) return;
  try {
    await accountsStore.deleteAccount({
      id: props.account.id,
    });
    addSuccessNotification(t('pages.account.deletion.success', { accountName }));
    router.push({ name: ROUTES_NAMES.accounts });
  } catch {
    addErrorNotification(t('pages.account.deletion.error'));
  }
};
</script>

<template>
  <div class="border-destructive @container/danger-zone mt-4 grid gap-4 rounded-xl border p-4 sm:-mx-4">
    <p class="text-xl font-medium">{{ t('pages.account.deletion.dangerZone') }}</p>

    <div class="flex flex-col justify-between gap-2 @[400px]/danger-zone:flex-row @[400px]/danger-zone:items-center">
      <div>
        <p class="mb-2 font-bold">{{ t('pages.account.deletion.title') }}</p>
        <p class="text-xs">
          {{ t('pages.account.deletion.description') }} <br />
          <b>{{ t('pages.account.deletion.transactionsWarning') }}</b>
          {{ t('pages.account.deletion.certaintyWarning') }}
        </p>
      </div>

      <AlertDialog
        :title="t('pages.account.deletion.confirmTitle')"
        :accept-disabled="confirmAccountName !== account.name"
        accept-variant="destructive"
        @accept="deleteAccount"
      >
        <template #trigger>
          <Button variant="destructive"> {{ t('pages.account.deletion.deleteButton') }} </Button>
        </template>
        <template #description>
          <template v-if="accountHasTransactions">
            {{ t('pages.account.deletion.cannotUndo') }}
            <strong>
              {{ t('pages.account.deletion.transactionCount', { count: transactions.length }) }}
            </strong>
            {{ t('pages.account.deletion.deleteConfirm') }}
          </template>
          <template v-else>
            {{ t('pages.account.deletion.cannotUndo') }} {{ t('pages.account.deletion.deleteConfirm') }}
            <strong> {{ t('pages.account.deletion.noTransactions') }} </strong>
          </template>
        </template>
        <template #content>
          <div class="mb-3">
            <p class="text-muted-foreground mb-1 text-xs">{{ t('pages.account.deletion.accountNameLabel') }}</p>
            <ClickToCopy :value="account.name" />
          </div>

          <InputField
            v-model="confirmAccountName"
            :placeholder="$t('pages.account.deletion.confirmPlaceholder')"
            class="border-destructive focus-visible:outline-destructive"
          />
        </template>
      </AlertDialog>
    </div>
  </div>
</template>
