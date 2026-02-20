<script setup lang="ts">
import { linkAccountToBankConnection } from '@/api/accounts';
import {
  type AvailableAccount,
  type BankConnection,
  getAvailableAccounts,
  listConnections,
} from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { Label } from '@/components/lib/ui/label';
import * as Select from '@/components/lib/ui/select';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable/formatters';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { CheckIcon, Link2Icon } from 'lucide-vue-next';
import { computed, ref } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();
const accountsStore = useAccountsStore();

const isAccountLinkedToBank = computed(() => !!props.account.bankDataProviderConnectionId);
const isSystemAccount = computed(() => props.account.type === 'system');

// Only show for system accounts that are not yet linked
const showLinkOption = computed(() => isSystemAccount.value && !isAccountLinkedToBank.value);

// Dialog state
const isDialogOpen = ref(false);

// Form state
const selectedConnectionId = ref<string>(undefined);
const selectedExternalAccountId = ref<string>(undefined);
const isLinking = ref(false);

// Fetch user connections
const { data: connections, isLoading: isLoadingConnections } = useQuery<BankConnection[]>({
  queryKey: VUE_QUERY_CACHE_KEYS.bankConnections,
  queryFn: listConnections,
  enabled: showLinkOption,
});

// Fetch external accounts for selected connection
const { data: externalAccounts, isLoading: isLoadingExternalAccounts } = useQuery<AvailableAccount[]>({
  queryKey: [...VUE_QUERY_CACHE_KEYS.bankAvailableExternalAccounts, selectedConnectionId],
  queryFn: () => getAvailableAccounts(Number(selectedConnectionId.value)),
  enabled: computed(() => !!selectedConnectionId.value),
});

const hasConnections = computed(() => connections.value && connections.value.length > 0);
const hasExternalAccounts = computed(() => externalAccounts.value && externalAccounts.value.length > 0);

const canConfirmLink = computed(() => {
  return (
    !!selectedConnectionId.value && !!selectedExternalAccountId.value && !isLinking.value && !currencyMismatch.value
  );
});

const linkAccount = async () => {
  if (!canConfirmLink.value) return;

  isLinking.value = true;
  try {
    const result = await linkAccountToBankConnection({
      accountId: props.account.id,
      connectionId: Number(selectedConnectionId.value)!,
      externalAccountId: selectedExternalAccountId.value!,
    });

    // Refresh accounts store
    await accountsStore.loadAccounts();

    addSuccessNotification(result.message);
    resetForm();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while trying to link account';
    addErrorNotification(errorMessage);
  } finally {
    isLinking.value = false;
  }
};

const resetForm = () => {
  isDialogOpen.value = false;
  selectedConnectionId.value = undefined;
  selectedExternalAccountId.value = undefined;
};

const selectedExternalAccount = computed(() => {
  if (!selectedExternalAccountId.value || !externalAccounts.value) return null;
  return externalAccounts.value.find((a) => a.externalId === selectedExternalAccountId.value);
});

const currencyMismatch = computed(() => {
  if (!selectedExternalAccount.value) return false;
  return selectedExternalAccount.value.currency.toLowerCase() !== props.account.currencyCode.toLowerCase();
});

const linkingError = computed(() => {
  if (currencyMismatch.value) {
    return `Currency mismatch: System account uses ${props.account.currencyCode}, but selected external account uses ${selectedExternalAccount.value?.currency}. Please select an account with matching currency.`;
  }
  return null;
});
</script>

<template>
  <div v-if="showLinkOption" class="rounded-lg border p-5">
    <div class="mb-4 flex items-center gap-2.5">
      <div class="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
        <Link2Icon class="size-4" />
      </div>
      <div>
        <p class="font-semibold">{{ $t('pages.account.link.title') }}</p>
        <p class="text-muted-foreground text-xs">{{ $t('pages.account.link.description') }}</p>
      </div>
    </div>

    <div class="mb-5 space-y-2">
      <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {{ $t('pages.account.link.whatWillHappen') }}
      </p>
      <ul class="space-y-1.5">
        <li
          v-for="key in ['listItem1', 'listItem2', 'listItem3', 'listItem4']"
          :key="key"
          class="flex items-start gap-2 text-sm"
        >
          <CheckIcon class="text-primary mt-0.5 size-4 shrink-0" />
          <span>{{ $t(`pages.account.link.${key}`) }}</span>
        </li>
      </ul>
    </div>

    <ResponsiveDialog v-model:open="isDialogOpen">
      <template #trigger>
        <Button class="w-full" :disabled="isLinking">
          {{ isLinking ? $t('pages.account.link.linking') : $t('pages.account.link.linkButton') }}
        </Button>
      </template>

      <template #title>{{ $t('pages.account.link.dialogTitle') }}</template>

      <template #description>{{ $t('pages.account.link.dialogDescription') }}</template>

      <div class="space-y-4">
        <!-- Select Bank Connection -->
        <div class="space-y-2">
          <Label for="connection-select">{{ $t('pages.account.link.connectionLabel') }}</Label>
          <Select.Select v-model="selectedConnectionId" :disabled="isLoadingConnections || !hasConnections">
            <Select.SelectTrigger id="connection-select">
              <Select.SelectValue :placeholder="$t('pages.account.link.selectConnection')" />
            </Select.SelectTrigger>
            <Select.SelectContent>
              <template v-if="isLoadingConnections">
                <Select.SelectItem disabled value="loading">{{
                  $t('pages.account.link.loadingConnections')
                }}</Select.SelectItem>
              </template>
              <template v-else-if="hasConnections">
                <Select.SelectItem v-for="conn in connections" :key="conn.id" :value="String(conn.id)">
                  {{ conn.providerName }}
                </Select.SelectItem>
              </template>
              <template v-else>
                <Select.SelectItem disabled value="none">{{
                  $t('pages.account.link.noConnections')
                }}</Select.SelectItem>
              </template>
            </Select.SelectContent>
          </Select.Select>
        </div>

        <!-- Select External Account -->
        <div v-if="selectedConnectionId" class="space-y-2">
          <Label for="account-select">{{ $t('pages.account.link.accountLabel') }}</Label>
          <Select.Select
            v-model="selectedExternalAccountId"
            :disabled="isLoadingExternalAccounts || !hasExternalAccounts"
          >
            <Select.SelectTrigger id="account-select">
              <Select.SelectValue
                :placeholder="
                  isLoadingExternalAccounts
                    ? $t('pages.account.link.loading')
                    : $t('pages.account.link.selectExternalAccount')
                "
              />
            </Select.SelectTrigger>
            <Select.SelectContent>
              <template v-if="isLoadingExternalAccounts">
                <Select.SelectItem disabled value="loading">{{
                  $t('pages.account.link.loadingAccounts')
                }}</Select.SelectItem>
              </template>
              <template v-else-if="hasExternalAccounts">
                <Select.SelectItem v-for="acc in externalAccounts" :key="acc.externalId" :value="acc.externalId">
                  {{ acc.name }} ({{ formatAmountByCurrencyCode(acc.balance, acc.currency) }})
                </Select.SelectItem>
              </template>
              <template v-else>
                <Select.SelectItem disabled value="none">{{
                  $t('pages.account.link.noExternalAccounts')
                }}</Select.SelectItem>
              </template>
            </Select.SelectContent>
          </Select.Select>
        </div>

        <!-- Currency Mismatch Error -->
        <div v-if="linkingError" class="bg-destructive/10 rounded-md p-3 text-sm">
          <p class="text-destructive-text font-semibold">{{ $t('pages.account.link.mismatchWarning') }}</p>
          <p class="text-destructive-text mt-1 text-xs">{{ linkingError }}</p>
        </div>

        <!-- Balance Preview -->
        <div v-else-if="selectedExternalAccount" class="bg-muted rounded-md p-3 text-sm">
          <p class="mb-1 font-semibold">{{ $t('pages.account.link.balanceComparison') }}</p>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <p class="text-muted-foreground">{{ $t('pages.account.link.systemAccount') }}</p>
              <p class="font-mono">
                {{ formatAmountByCurrencyCode(account.currentBalance, account.currencyCode) }}
              </p>
            </div>
            <div>
              <p class="text-muted-foreground">{{ $t('pages.account.link.externalAccount') }}</p>
              <p class="font-mono">
                {{ formatAmountByCurrencyCode(selectedExternalAccount.balance, selectedExternalAccount.currency) }}
              </p>
            </div>
          </div>
          <p class="mt-2 text-xs text-yellow-600">
            {{ $t('pages.account.link.adjustmentNote') }}
          </p>
        </div>
      </div>

      <template #footer="{ close }">
        <Button variant="outline" @click="close">{{ $t('common.actions.cancel') }}</Button>
        <Button :disabled="!canConfirmLink" @click="linkAccount">
          {{ isLinking ? $t('pages.account.link.linking') : $t('pages.account.link.acceptLabel') }}
        </Button>
      </template>
    </ResponsiveDialog>
  </div>
</template>
