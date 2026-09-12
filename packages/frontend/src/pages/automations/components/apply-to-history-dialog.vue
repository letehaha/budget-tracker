<script setup lang="ts">
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { Checkbox, type CheckedState } from '@/components/lib/ui/checkbox';
import { useNotificationCenter } from '@/components/notification-center';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { useApplyAutomationToHistory, usePreviewAutomation } from '@/composable/data-queries/transaction-automations';
import { extractApiErrorMessage } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import { AUTOMATION_LIMITS, type RecordId, type TransactionAutomationModel } from '@bt/shared/types';
import { ArrowLeftIcon, ArrowRightIcon, CheckCheckIcon, Loader2Icon, PlusIcon, SearchXIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { type AutomationMatchBadgeKey, getBadgeKey, isLocked, isPreselected } from './apply-to-history-selection';
import AutomationChipTrack from './automation-chip-track.vue';
import { buildAutomationChips } from './automation-chips';
import { provideAutomationRefs } from './automation-refs';
import AutomationRow from './automation-row.vue';

const SKELETON_ROW_COUNT = 6;

const BADGE_LABEL_KEYS: Record<AutomationMatchBadgeKey, string> = {
  manual: 'automations.applyToHistory.badge.manual',
  ai: 'automations.applyToHistory.badge.ai',
  subscriptionKept: 'automations.applyToHistory.badge.subscriptionKept',
};

const props = defineProps<{
  open: boolean;
  rule: TransactionAutomationModel | null;
  rules?: TransactionAutomationModel[];
  rulesLoading?: boolean;
  rulesError?: boolean;
}>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { t } = useI18n();
const { addSuccessNotification, addWarningNotification, addErrorNotification } = useNotificationCenter();

provideAutomationRefs();

const preview = usePreviewAutomation();
const applyMutation = useApplyAutomationToHistory();

const step = ref<'pick' | 'review'>(props.rule ? 'review' : 'pick');
const pickedRule = ref<TransactionAutomationModel | null>(null);
const selectedIds = ref(new Set<RecordId>());
const isConfirmOpen = ref(false);

const activeRule = computed(() => props.rule ?? pickedRule.value);
const matches = computed(() => preview.data.value?.matches ?? []);
const chips = computed(() => (activeRule.value ? buildAutomationChips({ rule: activeRule.value }) : null));
const hasPayeeAction = computed(() => activeRule.value?.actions.some((action) => action.type === 'set_payee') ?? false);

const rows = computed(() => {
  const rule = activeRule.value;
  if (!rule) return [];

  return matches.value.map((tx) => {
    const badgeKey = getBadgeKey({ tx });
    return { tx, locked: isLocked({ tx, rule }), badge: badgeKey ? t(BADGE_LABEL_KEYS[badgeKey]) : null };
  });
});

const selectableIds = computed(() => rows.value.filter((row) => !row.locked).map((row) => row.tx.id));
const isEmptyReview = computed(() => step.value === 'review' && preview.isSuccess.value && !rows.value.length);
const isSettled = computed(() => (preview.data.value?.settledCount ?? 0) > 0);

const selectAllState = computed<CheckedState>(() => {
  if (!selectedIds.value.size) return false;
  return selectedIds.value.size === selectableIds.value.length ? true : 'indeterminate';
});

const toggleAll = () => {
  if (!selectableIds.value.length) return;
  selectedIds.value = selectedIds.value.size === selectableIds.value.length ? new Set() : new Set(selectableIds.value);
};

const toggleRow = ({ id }: { id: RecordId }) => {
  const next = new Set(selectedIds.value);
  if (!next.delete(id)) next.add(id);
  selectedIds.value = next;
};

const runPreview = () => {
  const rule = activeRule.value;
  if (!rule) return;

  preview.mutate(
    { automationId: rule.id, limit: AUTOMATION_LIMITS.maxApplyIds },
    {
      onSuccess: (result) =>
        (selectedIds.value = new Set(result.matches.filter((tx) => isPreselected({ tx, rule })).map((tx) => tx.id))),
    },
  );
};

if (props.rule) runPreview();

const openReview = ({ rule }: { rule: TransactionAutomationModel }) => {
  pickedRule.value = rule;
  step.value = 'review';
  runPreview();
};

const backToPick = () => {
  step.value = 'pick';
  pickedRule.value = null;
  preview.reset();
  selectedIds.value = new Set();
};

/** Closing mid-apply would dispose the scope and drop the mutation callbacks. */
const requestOpenChange = ({ value }: { value: boolean }) => {
  if (applyMutation.isPending.value) return;
  emit('update:open', value);
};

const handleApply = () => {
  const rule = activeRule.value;
  if (!rule || !selectedIds.value.size) return;

  isConfirmOpen.value = false;
  applyMutation.mutate(
    { id: rule.id, transactionIds: [...selectedIds.value] },
    {
      onSuccess: ({ appliedCount, skippedIds }) => {
        if (!appliedCount) {
          addWarningNotification(t('automations.applyToHistory.nothingApplied', { skipped: skippedIds.length }));
        } else {
          addSuccessNotification(
            skippedIds.length
              ? t('automations.applyToHistory.successWithSkipped', {
                  applied: appliedCount,
                  skipped: skippedIds.length,
                })
              : t('automations.applyToHistory.success', { applied: appliedCount }),
          );
        }
        emit('update:open', false);
      },
      onError: (error) =>
        addErrorNotification(extractApiErrorMessage(error) || t('automations.applyToHistory.applyError')),
    },
  );
};
</script>

<template>
  <ResponsiveDialog
    :open="open"
    dialog-content-class="max-w-2xl"
    @update:open="(value: boolean) => requestOpenChange({ value })"
  >
    <template #title>
      <div class="flex items-center gap-2">
        <Button
          v-if="step === 'review' && !rule"
          variant="ghost"
          size="icon-sm"
          :aria-label="$t('automations.editor.back')"
          @click="backToPick"
        >
          <ArrowLeftIcon class="size-4" />
        </Button>
        {{
          step === 'pick' || !activeRule
            ? $t('automations.applyToHistory.pickTitle')
            : $t('automations.applyToHistory.title', { name: activeRule.name })
        }}
      </div>
    </template>

    <template v-if="step === 'pick'" #description>{{ $t('automations.applyToHistory.pickHint') }}</template>

    <template v-if="step === 'pick'">
      <div v-if="rulesLoading" class="flex flex-col gap-2">
        <div v-for="index in SKELETON_ROW_COUNT" :key="index" class="bg-muted h-16 animate-pulse rounded-md" />
      </div>

      <p v-else-if="rulesError" class="text-destructive-text text-sm">{{ $t('automations.loadError') }}</p>

      <div v-else-if="!rules?.length" class="flex flex-col items-center gap-3 py-6 text-center">
        <p class="text-muted-foreground text-sm">{{ $t('automations.applyToHistory.noRules') }}</p>
        <router-link :to="{ name: ROUTES_NAMES.automationCreate }">
          <Button as="span" variant="outline" size="sm">
            <PlusIcon class="size-4" />
            {{ $t('automations.emptyState.cta') }}
          </Button>
        </router-link>
      </div>

      <div v-else class="divide-border @container/automations divide-y rounded-md border">
        <AutomationRow
          v-for="(item, index) in rules"
          :key="item.id"
          :rule="item"
          :position="index + 1"
          density="compact"
          :reorderable="false"
          selectable
          @select="openReview({ rule: item })"
        />
      </div>
    </template>

    <div v-else class="flex flex-col gap-3">
      <div v-if="preview.isPending.value" class="flex flex-col gap-2">
        <div v-for="index in SKELETON_ROW_COUNT" :key="index" class="bg-muted h-8 animate-pulse rounded-md" />
      </div>

      <p v-else-if="preview.isError.value" class="text-destructive-text text-xs">
        {{ extractApiErrorMessage(preview.error.value) || $t('automations.editor.preview.error') }}
      </p>

      <template v-else-if="preview.data.value">
        <div v-if="chips" class="flex flex-wrap items-center gap-1.5">
          <AutomationChipTrack :chips="chips.when" :match="chips.match" variant="when" density="comfortable" />
          <ArrowRightIcon
            v-if="chips.when.length && chips.then.length"
            class="text-muted-foreground size-3.5 shrink-0"
          />
          <AutomationChipTrack :chips="chips.then" variant="then" density="comfortable" />
        </div>

        <p v-if="rows.length" class="text-muted-foreground text-xs">
          {{ $t('automations.applyToHistory.summary', { count: preview.data.value.matchedCount }) }}
        </p>

        <p v-if="preview.data.value.matchedCount > matches.length" class="text-warning-text text-xs">
          {{ $t('automations.applyToHistory.moreMatches', { shown: matches.length }) }}
        </p>

        <p
          v-if="preview.data.value.scannedCount >= AUTOMATION_LIMITS.applyScanLimit"
          class="text-muted-foreground text-xs"
        >
          {{ $t('automations.applyToHistory.scanCapped', { limit: AUTOMATION_LIMITS.applyScanLimit }) }}
        </p>

        <div
          v-if="!rows.length"
          class="border-border bg-muted/30 flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center"
        >
          <span
            class="flex size-11 items-center justify-center rounded-full"
            :class="isSettled ? 'bg-success-text/10 text-success-text' : 'bg-muted text-muted-foreground'"
          >
            <CheckCheckIcon v-if="isSettled" class="size-5" />
            <SearchXIcon v-else class="size-5" />
          </span>
          <div class="flex flex-col gap-1">
            <p class="font-medium">
              {{
                $t(
                  isSettled
                    ? 'automations.applyToHistory.emptyState.settledTitle'
                    : 'automations.applyToHistory.emptyState.noneTitle',
                )
              }}
            </p>
            <p class="text-muted-foreground max-w-sm text-sm text-balance">
              {{
                isSettled
                  ? $t('automations.applyToHistory.emptyState.settledDescription', {
                      count: preview.data.value.settledCount,
                    })
                  : $t('automations.applyToHistory.emptyState.noneDescription')
              }}
            </p>
          </div>
        </div>

        <template v-else>
          <div class="bg-dialog sticky -top-px z-10 flex items-center gap-2 border-b py-2">
            <label
              class="-my-1 flex cursor-pointer items-center gap-2 self-stretch px-3 text-sm"
              for="apply-to-history-select-all"
            >
              <Checkbox
                id="apply-to-history-select-all"
                :model-value="selectAllState"
                :disabled="!selectableIds.length"
                :aria-label="$t('automations.applyToHistory.selectAll')"
                @update:model-value="toggleAll"
              />
              {{ $t('automations.applyToHistory.selectAll') }}
            </label>
            <span class="text-muted-foreground ml-auto text-xs tabular-nums">
              {{ $t('automations.applyToHistory.selectedCount', { count: selectedIds.size }) }}
            </span>
          </div>

          <div class="flex flex-col gap-1">
            <div v-for="row in rows" :key="row.tx.id" class="flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <TransactionRecord
                  :tx="row.tx"
                  compact
                  show-checkbox
                  :is-selected="selectedIds.has(row.tx.id)"
                  :is-selectable="!row.locked"
                  :unselectable-reason="row.locked ? 'protectedCategory' : null"
                  @record-click="!row.locked && toggleRow({ id: row.tx.id })"
                  @selection-change="toggleRow({ id: row.tx.id })"
                />
              </div>
              <span v-if="row.badge" class="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs">
                {{ row.badge }}
              </span>
            </div>
          </div>
        </template>
      </template>
    </div>

    <template #footer>
      <div class="flex w-full flex-col gap-3">
        <p v-if="step === 'review' && !isEmptyReview" class="text-muted-foreground text-xs">
          {{ $t('automations.applyToHistory.irreversible') }}
        </p>
        <div class="flex justify-end gap-2">
          <Button variant="outline" :disabled="applyMutation.isPending.value" @click="emit('update:open', false)">
            {{ isEmptyReview ? $t('common.ui.close') : $t('common.actions.cancel') }}
          </Button>
          <Button
            v-if="step === 'review' && !isEmptyReview"
            :disabled="!selectedIds.size || applyMutation.isPending.value"
            @click="isConfirmOpen = true"
          >
            <Loader2Icon v-if="applyMutation.isPending.value" class="size-4 animate-spin" />
            {{ $t('automations.applyToHistory.applyAction', { count: selectedIds.size }) }}
          </Button>
        </div>
      </div>
    </template>
  </ResponsiveDialog>

  <ResponsiveAlertDialog
    v-model:open="isConfirmOpen"
    :confirm-label="$t('automations.applyToHistory.confirm.action')"
    confirm-variant="destructive"
    @confirm="handleApply"
  >
    <template #title>{{ $t('automations.applyToHistory.confirm.title') }}</template>
    <template #description>
      {{ $t('automations.applyToHistory.confirm.description', { count: selectedIds.size }) }}
      <template v-if="hasPayeeAction">{{ $t('automations.applyToHistory.confirm.payeeNote') }}</template>
    </template>
  </ResponsiveAlertDialog>
</template>
