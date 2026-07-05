<script setup lang="ts">
import { type LoanApi } from '@/api/loans';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/common/dropdown-menu';
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { Switch } from '@/components/lib/ui/switch';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useDeleteLoan, useLoanById } from '@/composable/data-queries/loans';
import { isApiErrorWithCode } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import { ROUTES_NAMES } from '@/routes';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_STATUSES, API_ERROR_CODES } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  EyeOffIcon,
  Link2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import { useUnarchiveLoan } from '../composables/use-unarchive-loan';
import EditLoanDialog from './edit-loan-dialog.vue';
import LinkPaymentsDialog from './link-payments-dialog.vue';
import LoanPaymentDialog from './loan-payment-dialog/index.vue';

const props = defineProps<{ loan: LoanApi }>();

const { t } = useI18n();
const router = useRouter();
const { addNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const { accountsRecord } = storeToRefs(accountsStore);
const deleteLoanMutation = useDeleteLoan();
const loanQuery = useLoanById({ id: computed(() => props.loan.id) });
const queryClient = useQueryClient();
const { unarchive, isPending: isUnarchivePending } = useUnarchiveLoan();

// The loan IS an Accounts row; the payment dialog needs that account model to open.
const loanAccount = computed(() => accountsRecord.value[props.loan.id]);
const isPaidOff = computed(() => props.loan.projection.isPaidOff);

const isEditDialogOpen = ref(false);
const isRecordPaymentOpen = ref(false);
const isLinkPaymentsOpen = ref(false);
const isArchiveDialogOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const archiveAlsoExclude = ref(true);

const isArchived = computed(() => props.loan.status === ACCOUNT_STATUSES.archived);

// Backend refuses to delete a loan with recorded payments (would orphan ledger entries) — surface that
// upfront and disable the destructive button rather than let the user hit a rejection toast. Timeline
// events (corrections, notes, rate changes) don't block deletion.
const deleteBlockReason = computed<'payments' | null>(() => {
  if (props.loan.paymentsCount > 0) return 'payments';
  return null;
});

// Local mirror so the Switch updates immediately; synced back when the persisted value changes
// (e.g. archive flips it on via "Also exclude from statistics").
const excludeFromStats = ref(props.loan.excludeFromStats);
watch(
  () => props.loan.excludeFromStats,
  (next) => {
    excludeFromStats.value = next;
  },
);

const isToggleSaving = ref(false);
const isArchiveSaving = ref(false);

const handleExcludeToggle = async (next: boolean) => {
  if (next === props.loan.excludeFromStats) return;
  isToggleSaving.value = true;
  try {
    await accountsStore.editAccount({ id: props.loan.id, excludeFromStats: next });
    await loanQuery.invalidate();
    addNotification({ text: t('loans.settings.toggleSuccess'), type: NotificationType.success });
  } catch (error) {
    excludeFromStats.value = props.loan.excludeFromStats;
    addNotification({ text: t('loans.settings.toggleError'), type: NotificationType.error });
    captureException({ error, context: { source: 'loanSettings.excludeFromStats' } });
  } finally {
    isToggleSaving.value = false;
  }
};

const handleArchive = async () => {
  isArchiveSaving.value = true;
  try {
    await accountsStore.editAccount({
      id: props.loan.id,
      status: ACCOUNT_STATUSES.archived,
      ...(archiveAlsoExclude.value ? { excludeFromStats: true } : {}),
    });
    // The list query must refetch too — /loans moves the loan into the Archived section.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.loansList }),
      loanQuery.invalidate(),
    ]);
    isArchiveDialogOpen.value = false;
    addNotification({ text: t('loans.settings.archiveSuccess'), type: NotificationType.success });
  } catch (error) {
    addNotification({ text: t('loans.settings.archiveError'), type: NotificationType.error });
    captureException({ error, context: { source: 'loanSettings.archive' } });
  } finally {
    isArchiveSaving.value = false;
  }
};

const handleDelete = async () => {
  try {
    await deleteLoanMutation.mutateAsync({ id: props.loan.id });
    isDeleteDialogOpen.value = false;
    addNotification({ text: t('loans.settings.deleteSuccess'), type: NotificationType.success });
    await router.push({ name: ROUTES_NAMES.loans });
  } catch (error) {
    // Surface backend-side block reasons verbatim – they already explain why
    // the delete was rejected and are localised by the API.
    if (isApiErrorWithCode(error, API_ERROR_CODES.validationError) && error.data?.message) {
      addNotification({ text: error.data.message, type: NotificationType.error });
    } else {
      addNotification({ text: t('loans.settings.deleteError'), type: NotificationType.error });
      captureException({ error, context: { source: 'loanSettings.delete' } });
    }
  }
};
</script>

<template>
  <div class="flex items-center gap-2">
    <Button variant="outline" size="sm" @click="isEditDialogOpen = true">
      <PencilIcon class="size-4" />
      {{ $t('loans.settings.editButton') }}
    </Button>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="outline" size="sm" :aria-label="$t('loans.actions.moreAriaLabel')">
          <MoreHorizontalIcon class="size-4" />
          <span>{{ $t('loans.actions.more') }}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-64">
        <!-- Paid-off loans hide the header "Record payment" button; keep it here for after-the-fact corrections. -->
        <template v-if="isPaidOff">
          <DropdownMenuItem @select="isRecordPaymentOpen = true">
            <PlusIcon class="size-4" />
            {{ $t('loans.detail.recordPayment') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </template>

        <DropdownMenuItem @select="isLinkPaymentsOpen = true">
          <Link2Icon class="size-4" />
          {{ $t('loans.actions.linkPayments') }}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem class="justify-between gap-3" @select.prevent>
          <span class="flex items-center gap-2">
            <EyeOffIcon class="size-4" />
            {{ $t('loans.actions.excludeFromStats') }}
          </span>
          <Switch
            v-model:model-value="excludeFromStats"
            :disabled="isToggleSaving"
            @update:model-value="handleExcludeToggle"
            @click.stop
          />
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem v-if="!isArchived" @select="isArchiveDialogOpen = true">
          <ArchiveIcon class="size-4" />
          {{ $t('loans.settings.archiveButton') }}
        </DropdownMenuItem>
        <DropdownMenuItem v-else :disabled="isUnarchivePending" @select="unarchive({ loan })">
          <ArchiveRestoreIcon class="size-4" />
          {{ $t('loans.settings.unarchiveButton') }}
        </DropdownMenuItem>

        <DropdownMenuItem
          class="text-destructive-text focus:bg-destructive-text/10 focus:text-destructive-text"
          @select="isDeleteDialogOpen = true"
        >
          <Trash2Icon class="size-4" />
          {{ $t('loans.settings.deleteButton') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>

  <EditLoanDialog v-model:open="isEditDialogOpen" :loan="loan" />

  <LoanPaymentDialog v-if="loanAccount" v-model:open="isRecordPaymentOpen" :loan-account="loanAccount" />

  <LinkPaymentsDialog v-model:open="isLinkPaymentsOpen" :loan="loan" />

  <ResponsiveAlertDialog
    v-model:open="isArchiveDialogOpen"
    :confirm-label="$t('loans.settings.archiveButton')"
    :confirm-disabled="isArchiveSaving"
    @confirm="handleArchive"
  >
    <template #title>{{ $t('loans.settings.archiveConfirmTitle') }}</template>
    <template #description>
      <p class="mb-2">{{ $t('loans.settings.archiveConfirmDescription', { name: loan.name }) }}</p>
    </template>

    <label class="mt-3 flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox v-model="archiveAlsoExclude" />
      {{ $t('loans.settings.archiveAlsoExclude') }}
    </label>
  </ResponsiveAlertDialog>

  <ResponsiveAlertDialog
    v-model:open="isDeleteDialogOpen"
    :confirm-label="$t('loans.settings.deleteButton')"
    confirm-variant="destructive"
    :confirm-disabled="deleteLoanMutation.isPending.value || deleteBlockReason !== null"
    @confirm="handleDelete"
  >
    <template #title>{{ $t('loans.settings.deleteConfirmTitle') }}</template>
    <template #description>
      <template v-if="deleteBlockReason === 'payments'">
        {{ $t('loans.settings.deleteBlockedByPayments') }}
      </template>
      <template v-else>
        {{ $t('loans.settings.deleteConfirmDescription', { name: loan.name }) }}
      </template>
    </template>
  </ResponsiveAlertDialog>
</template>
