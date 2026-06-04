<template>
  <div class="@container space-y-4">
    <Card class="px-4 py-4">
      <div class="flex flex-col gap-3 @sm:flex-row @sm:items-start @sm:justify-between">
        <div class="min-w-0">
          <RouterLink
            :to="{ name: ROUTES_NAMES.settingsPayees }"
            class="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ChevronLeftIcon class="size-3.5" />
            {{ $t('payees.title') }}
          </RouterLink>
          <h2 class="mt-2 text-xl font-semibold">{{ payeeData?.name ?? '…' }}</h2>
        </div>
        <div class="shrink-0">
          <PayeeActionsDropdown
            :disabled="!payeeData"
            @rename="openRename"
            @merge="openMerge"
            @delete="openDelete"
            @delete-and-ignore="openDeleteAndIgnore"
          />
        </div>
      </div>

      <div v-if="payeeData" class="mt-4 grid gap-3 @md:grid-cols-2">
        <div class="flex flex-col gap-3">
          <div>
            <p class="text-muted-foreground text-xs">{{ $t('payees.columns.defaultCategory') }}</p>
            <CategorySelectField
              v-model="defaultCategoryProxy"
              :values="formattedCategories"
              label-key="name"
              :placeholder="$t('payees.detail.defaultCategoryPlaceholder')"
            />
          </div>
          <div>
            <p class="text-muted-foreground text-xs">{{ $t('payees.form.categorizationMode.label') }}</p>
            <SelectField
              v-model="categorizationModeProxy"
              :values="categorizationModeOptions"
              label-key="label"
              value-key="value"
            />
            <p class="text-muted-foreground mt-1 text-xs">{{ categorizationModeProxy.hint }}</p>
          </div>
        </div>
        <div v-if="payeeData.stats" class="grid grid-cols-3 gap-2">
          <Stat
            :label="$t('payees.columns.transactionCount')"
            :value="String(payeeData.stats.transactionCount)"
            :clickable="payeeData.stats.transactionCount > 0"
            @click="openTransactionsDialog"
          />
          <Stat
            :label="$t('payees.columns.netFlow')"
            :value="formatNetFlow(payeeData.stats.netFlowRef)"
            :tone="netFlowTone(payeeData.stats.netFlowRef)"
          />
          <Stat
            :label="$t('payees.columns.topCategory')"
            :value="categoryName(payeeData.stats.topCategoryId) || '—'"
            :hint="$t('payees.detail.topCategoryHint')"
          >
            <template v-if="payeeData.stats.topCategoryId" #valuePrefix>
              <CategoryCircle :category-id="payeeData.stats.topCategoryId" class="size-5" />
            </template>
          </Stat>
        </div>
      </div>
    </Card>

    <Card class="px-4 py-4">
      <h3 class="text-sm font-semibold">{{ $t('payees.detail.aliasesHeading') }}</h3>
      <ul v-if="payeeData?.aliases && payeeData.aliases.length > 0" class="mt-2 grid gap-1">
        <li
          v-for="alias in payeeData.aliases"
          :key="alias.id"
          class="bg-muted/40 flex items-center justify-between rounded px-3 py-2 text-sm"
        >
          <span class="truncate">{{ alias.rawName }}</span>
          <DesktopOnlyTooltip
            :content="
              isCanonicalAlias(alias.normalizedName)
                ? $t('payees.detail.cannotDeleteCanonicalAlias')
                : $t('payees.detail.deleteAliasConfirm')
            "
          >
            <Button
              variant="ghost-destructive"
              size="icon-sm"
              :disabled="isCanonicalAlias(alias.normalizedName)"
              :aria-label="$t('payees.detail.deleteAliasConfirm')"
              @click="confirmDeleteAlias(alias.id)"
            >
              <Trash2Icon class="size-4" />
            </Button>
          </DesktopOnlyTooltip>
        </li>
      </ul>
      <p v-else class="text-muted-foreground mt-2 text-xs">—</p>
    </Card>

    <PayeeFormDialog v-model:open="renameOpen" :payee="payeeData ?? null" @saved="refetch()" />

    <ResponsiveAlertDialog
      v-model:open="deleteOpen"
      :confirm-label="$t('common.actions.delete')"
      confirm-variant="destructive"
      @confirm="handleDelete"
    >
      <template #title>{{ $t('payees.detail.deletePayeeTitle') }}</template>
      <template #description>{{ $t('payees.detail.deletePayeeDescription') }}</template>
    </ResponsiveAlertDialog>

    <ResponsiveAlertDialog
      v-model:open="deleteAndIgnoreOpen"
      :confirm-label="$t('payees.actions.deleteAndIgnore')"
      confirm-variant="destructive"
      @confirm="handleDeleteAndIgnore"
    >
      <template #title>{{ $t('payees.detail.deleteAndIgnoreTitle') }}</template>
      <template #description>{{ $t('payees.detail.deleteAndIgnoreDescription') }}</template>
    </ResponsiveAlertDialog>

    <PayeeTransactionsDialog
      v-model:open="transactionsDialogOpen"
      :payee-id="payeeData?.id ?? null"
      :payee-name="payeeData?.name ?? null"
    />

    <ResponsiveDialog v-model:open="mergeOpen">
      <template #default>
        <div class="flex flex-col gap-4 p-4">
          <h3 class="text-lg font-semibold">{{ $t('payees.detail.mergeTitle') }}</h3>
          <p class="text-muted-foreground text-sm">{{ $t('payees.detail.mergeDescription') }}</p>
          <PayeeSelectField v-model="mergeTargetId" :label="$t('payees.actions.merge')" :exclude-id="payeeData?.id" />
          <div class="flex justify-end gap-2 pt-2">
            <Button variant="ghost" @click="mergeOpen = false">{{ $t('common.actions.cancel') }}</Button>
            <Button variant="default" :disabled="!mergeTargetId" @click="handleMerge">
              {{ $t('payees.detail.confirmMerge') }}
            </Button>
          </div>
        </div>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<script setup lang="ts">
import {
  useDeletePayee,
  useDeletePayeeAlias,
  useDeletePayeeAndIgnore,
  useMergePayees,
  usePayee,
  useUpdatePayee,
} from '@/composable/data-queries/payees';
import { useBaseCurrency } from '@/composable/data-queries/currencies';
import { useNotificationCenter } from '@/components/notification-center';
import { useCategoriesStore } from '@/stores';
import { findFormattedCategoryById } from '@/stores/categories/helpers';
import CategoryCircle from '@/components/common/category-circle.vue';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import PayeeSelectField from '@/components/fields/payee-select-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { ROUTES_NAMES } from '@/routes/constants';
import { CATEGORIZATION_MODE } from '@bt/shared/types';
import { ChevronLeftIcon, Trash2Icon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

import PayeeActionsDropdown from './components/payee-actions-dropdown.vue';
import PayeeFormDialog from './components/payee-form-dialog.vue';
import Stat from './components/payee-stat.vue';
import PayeeTransactionsDialog from './components/payee-transactions-dialog.vue';

defineOptions({ name: 'settings-payee-detail' });

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const payeeId = computed(() => String(route.params.id));

const { data: payeeData, refetch } = usePayee({ id: payeeId });

const { formattedCategories, categoriesMap } = storeToRefs(useCategoriesStore());

const categoryName = (id: string | null) => (id ? (categoriesMap.value?.[id]?.name ?? '') : '');

const updateMut = useUpdatePayee();
const defaultCategoryProxy = computed({
  get: () =>
    payeeData.value?.defaultCategoryId
      ? findFormattedCategoryById(formattedCategories.value, payeeData.value.defaultCategoryId)
      : null,
  set: async (value) => {
    if (!payeeData.value) return;
    try {
      await updateMut.mutateAsync({
        id: payeeData.value.id,
        payload: { defaultCategoryId: value?.id ?? null },
      });
      addSuccessNotification(t('payees.toasts.updated'));
    } catch {
      addErrorNotification(t('payees.errors.generic'));
    }
  },
});

interface CategorizationModeOption {
  value: CATEGORIZATION_MODE;
  label: string;
  hint: string;
}

const categorizationModeOptions = computed<CategorizationModeOption[]>(() => [
  {
    value: CATEGORIZATION_MODE.enforce,
    label: t('payees.form.categorizationMode.enforce.label'),
    hint: t('payees.form.categorizationMode.enforce.hint'),
  },
  {
    value: CATEGORIZATION_MODE.hint,
    label: t('payees.form.categorizationMode.hint.label'),
    hint: t('payees.form.categorizationMode.hint.hint'),
  },
  {
    value: CATEGORIZATION_MODE.off,
    label: t('payees.form.categorizationMode.off.label'),
    hint: t('payees.form.categorizationMode.off.hint'),
  },
]);

const categorizationModeProxy = computed<CategorizationModeOption>({
  get: () => {
    const current = payeeData.value?.categorizationMode ?? CATEGORIZATION_MODE.enforce;
    return categorizationModeOptions.value.find((opt) => opt.value === current) ?? categorizationModeOptions.value[0]!;
  },
  set: async (value) => {
    if (!payeeData.value || value.value === payeeData.value.categorizationMode) return;
    try {
      await updateMut.mutateAsync({
        id: payeeData.value.id,
        payload: { categorizationMode: value.value },
      });
      addSuccessNotification(t('payees.toasts.updated'));
    } catch {
      addErrorNotification(t('payees.errors.generic'));
    }
  },
});

const NET_FLOW_FALLBACK_CURRENCY = 'USD';
const { data: baseCurrency } = useBaseCurrency();
const formatNetFlow = (val: number) =>
  new Intl.NumberFormat(locale.value, {
    style: 'currency',
    currency: baseCurrency.value?.currencyCode ?? NET_FLOW_FALLBACK_CURRENCY,
    signDisplay: 'always',
    maximumFractionDigits: 0,
  }).format(val);

const netFlowTone = (val: number) => {
  if (val > 0) return 'income' as const;
  if (val < 0) return 'expense' as const;
  return undefined;
};

const renameOpen = ref(false);
const openRename = () => (renameOpen.value = true);

const mergeOpen = ref(false);
const mergeTargetId = ref<string | null>(null);
const openMerge = () => {
  mergeTargetId.value = null;
  mergeOpen.value = true;
};
const mergeMut = useMergePayees();
async function handleMerge() {
  if (!payeeData.value || !mergeTargetId.value) return;
  try {
    await mergeMut.mutateAsync({
      sourceId: payeeData.value.id,
      targetPayeeId: mergeTargetId.value,
    });
    addSuccessNotification(t('payees.toasts.merged'));
    router.push({ name: ROUTES_NAMES.settingsPayees });
  } catch {
    addErrorNotification(t('payees.errors.generic'));
  }
}

const deleteOpen = ref(false);
const openDelete = () => (deleteOpen.value = true);
const deleteMut = useDeletePayee();
async function handleDelete() {
  if (!payeeData.value) return;
  try {
    await deleteMut.mutateAsync({ id: payeeData.value.id });
    addSuccessNotification(t('payees.toasts.deleted'));
    router.push({ name: ROUTES_NAMES.settingsPayees });
  } catch {
    addErrorNotification(t('payees.errors.generic'));
  }
}

const deleteAndIgnoreOpen = ref(false);
const openDeleteAndIgnore = () => (deleteAndIgnoreOpen.value = true);

const transactionsDialogOpen = ref(false);
const openTransactionsDialog = () => (transactionsDialogOpen.value = true);
const deleteAndIgnoreMut = useDeletePayeeAndIgnore();
async function handleDeleteAndIgnore() {
  if (!payeeData.value) return;
  try {
    await deleteAndIgnoreMut.mutateAsync({ id: payeeData.value.id });
    addSuccessNotification(t('payees.toasts.deletedAndIgnored'));
    router.push({ name: ROUTES_NAMES.settingsPayees });
  } catch {
    addErrorNotification(t('payees.errors.generic'));
  }
}

const isCanonicalAlias = (aliasNormalized: string) =>
  Boolean(payeeData.value && aliasNormalized === payeeData.value.normalizedName);

const deleteAliasMut = useDeletePayeeAlias();
async function confirmDeleteAlias(aliasId: string) {
  if (!payeeData.value) return;
  try {
    await deleteAliasMut.mutateAsync({ payeeId: payeeData.value.id, aliasId });
    addSuccessNotification(t('payees.toasts.aliasDeleted'));
  } catch (error) {
    // The button is hidden for the canonical-name alias under normal
    // conditions, but the validation still fires on race or stale UI state.
    // Surface the specific reason instead of a generic message.
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 422) {
      addErrorNotification(t('payees.detail.cannotDeleteCanonicalAlias'));
    } else {
      addErrorNotification(t('payees.errors.generic'));
    }
  }
}
</script>
