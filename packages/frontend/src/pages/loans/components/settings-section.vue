<script setup lang="ts">
import { type LoanApi } from '@/api/loans';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import * as Collapsible from '@/components/lib/ui/collapsible';
import { Switch } from '@/components/lib/ui/switch';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useDeleteLoan, useLoanById } from '@/composable/data-queries/loans';
import { captureException } from '@/lib/sentry';
import { ROUTES_NAMES } from '@/routes';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_STATUSES } from '@bt/shared/types';
import { ArchiveIcon, ArchiveRestoreIcon, ChevronDownIcon, PencilIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import EditLoanDialog from './edit-loan-dialog.vue';

const props = defineProps<{ loan: LoanApi }>();

const { t } = useI18n();
const router = useRouter();
const { addNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const deleteLoanMutation = useDeleteLoan();
const loanQuery = useLoanById({ id: computed(() => props.loan.id) });

const isOpen = ref(false);
const isEditDialogOpen = ref(false);
const isArchiveDialogOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const archiveAlsoExclude = ref(true);

const isArchived = computed(() => props.loan.status === ACCOUNT_STATUSES.archived);

// Local mirror so the Switch updates immediately; a debounce/save would be
// overkill on a single boolean toggle. Stays in sync with the persisted value
// (e.g. when archive also flips it on via "Also exclude from statistics").
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
    await loanQuery.invalidate();
    isArchiveDialogOpen.value = false;
    addNotification({ text: t('loans.settings.archiveSuccess'), type: NotificationType.success });
  } catch (error) {
    addNotification({ text: t('loans.settings.archiveError'), type: NotificationType.error });
    captureException({ error, context: { source: 'loanSettings.archive' } });
  } finally {
    isArchiveSaving.value = false;
  }
};

const handleUnarchive = async () => {
  isArchiveSaving.value = true;
  try {
    await accountsStore.editAccount({ id: props.loan.id, status: ACCOUNT_STATUSES.active });
    await loanQuery.invalidate();
    addNotification({ text: t('loans.settings.unarchiveSuccess'), type: NotificationType.success });
  } catch (error) {
    addNotification({ text: t('loans.settings.archiveError'), type: NotificationType.error });
    captureException({ error, context: { source: 'loanSettings.unarchive' } });
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
    addNotification({ text: t('loans.settings.deleteError'), type: NotificationType.error });
    captureException({ error, context: { source: 'loanSettings.delete' } });
  }
};
</script>

<template>
  <Card>
    <Collapsible.Collapsible v-model:open="isOpen">
      <Collapsible.CollapsibleTrigger as-child>
        <button
          type="button"
          class="hover:bg-muted/40 flex w-full items-center justify-between rounded-t-xl px-6 py-4 text-left transition-colors"
        >
          <span class="text-base font-semibold">{{ $t('loans.settings.title') }}</span>
          <ChevronDownIcon class="size-4 transition-transform" :class="{ 'rotate-180': isOpen }" />
        </button>
      </Collapsible.CollapsibleTrigger>

      <Collapsible.CollapsibleContent>
        <CardHeader class="sr-only">
          <div>{{ $t('loans.settings.title') }}</div>
        </CardHeader>
        <CardContent class="space-y-6 pt-2">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-medium">{{ $t('loans.settings.editTitle') }}</div>
              <div class="text-muted-foreground text-xs">{{ $t('loans.settings.editDescription') }}</div>
            </div>
            <Button variant="outline" size="sm" class="shrink-0" @click="isEditDialogOpen = true">
              <PencilIcon class="size-4" />
              {{ $t('loans.settings.editButton') }}
            </Button>
          </div>

          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-medium">{{ $t('loans.settings.excludeFromStatsTitle') }}</div>
              <div class="text-muted-foreground text-xs">{{ $t('loans.settings.excludeFromStatsDescription') }}</div>
            </div>
            <Switch
              v-model:model-value="excludeFromStats"
              :disabled="isToggleSaving"
              @update:model-value="handleExcludeToggle"
            />
          </div>

          <div class="border-warning grid gap-3 rounded-xl border p-4">
            <template v-if="!isArchived">
              <div>
                <div class="text-sm font-medium">{{ $t('loans.settings.archiveTitle') }}</div>
                <div class="text-muted-foreground text-xs">{{ $t('loans.settings.archiveDescription') }}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="justify-self-start"
                :disabled="isArchiveSaving"
                @click="isArchiveDialogOpen = true"
              >
                <ArchiveIcon class="size-4" />
                {{ $t('loans.settings.archiveButton') }}
              </Button>
            </template>
            <template v-else>
              <div>
                <div class="text-sm font-medium">{{ $t('loans.settings.archivedTitle') }}</div>
                <div class="text-muted-foreground text-xs">{{ $t('loans.settings.archivedDescription') }}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="justify-self-start"
                :disabled="isArchiveSaving"
                @click="handleUnarchive"
              >
                <ArchiveRestoreIcon class="size-4" />
                {{ $t('loans.settings.unarchiveButton') }}
              </Button>
            </template>
          </div>

          <div class="border-destructive grid gap-3 rounded-xl border p-4">
            <div>
              <div class="text-destructive-text text-sm font-medium">{{ $t('loans.settings.deleteTitle') }}</div>
              <div class="text-muted-foreground text-xs">{{ $t('loans.settings.deleteDescription') }}</div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              class="justify-self-start"
              :disabled="deleteLoanMutation.isPending.value"
              @click="isDeleteDialogOpen = true"
            >
              <Trash2Icon class="size-4" />
              {{ $t('loans.settings.deleteButton') }}
            </Button>
          </div>
        </CardContent>
      </Collapsible.CollapsibleContent>
    </Collapsible.Collapsible>
  </Card>

  <EditLoanDialog v-model:open="isEditDialogOpen" :loan="loan" />

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
    :confirm-disabled="deleteLoanMutation.isPending.value"
    @confirm="handleDelete"
  >
    <template #title>{{ $t('loans.settings.deleteConfirmTitle') }}</template>
    <template #description>
      {{ $t('loans.settings.deleteConfirmDescription', { name: loan.name }) }}
    </template>
  </ResponsiveAlertDialog>
</template>
