<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #default>
      <div class="flex flex-col gap-4">
        <h3 class="text-lg font-semibold">
          {{ isEdit ? $t('payees.actions.rename') : $t('payees.newPayeeButton') }}
        </h3>

        <InputField
          v-model="form.name"
          :label="$t('payees.columns.name')"
          :placeholder="$t('payees.form.namePlaceholder')"
          :error-message="nameError ?? undefined"
        />

        <!-- Logo picker: create-only. Renaming an existing payee uses the
             dedicated payee-logo-picker dialog instead. -->
        <div v-if="!isEdit" class="flex flex-col gap-2">
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-medium">{{ $t('payees.logo.fieldLabel') }}</span>
            <ResponsiveTooltip :delay-duration="100" :content="$t('payees.logo.domainHint')">
              <InfoIcon class="text-muted-foreground size-3.5 cursor-help" @click.prevent.stop />
            </ResponsiveTooltip>
          </div>
          <LogoField v-model="form.logo" :name-for-search="form.name" />
        </div>

        <CategorySelectField
          v-model="form.category"
          :label="$t('payees.columns.defaultCategory')"
          :placeholder="$t('payees.form.categoryPlaceholder')"
          :values="formattedCategories"
          label-key="name"
        />

        <SelectField
          v-model="form.categorizationMode"
          :label="$t('payees.form.categorizationMode.label')"
          :values="categorizationModeOptions"
          label-key="label"
          value-key="value"
        />
        <p class="text-muted-foreground -mt-2 text-xs">
          {{ activeModeHint }}
        </p>

        <div class="flex justify-end gap-2 pt-2">
          <Button variant="ghost" :disabled="isPending" @click="isOpen = false">
            {{ $t('common.actions.cancel') }}
          </Button>
          <Button variant="default" :disabled="!form.name || isPending" @click="handleSave">
            {{ $t('common.actions.save') }}
          </Button>
        </div>
      </div>
    </template>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { useCreatePayee, useUpdatePayee } from '@/composable/data-queries/payees';
import { useNotificationCenter } from '@/components/notification-center';
import { useCategoriesStore } from '@/stores';
import type { FormattedCategory } from '@/common/types';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import { Button } from '@/components/lib/ui/button';
import { ApiErrorResponseError, isApiErrorWithCode } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import { API_ERROR_CODES, CATEGORIZATION_MODE, PayeeModel } from '@bt/shared/types';
import { InfoIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import LogoField from '@/components/common/logo-field.vue';
import { type LogoSelection, toOptionalLogoPayload } from '@/components/common/logo-selection';

interface Props {
  open: boolean;
  payee: PayeeModel | null;
  /** Seed the name input in create mode. Ignored in edit mode. */
  initialName?: string;
}
const props = withDefaults(defineProps<Props>(), {
  initialName: '',
});
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'saved', payee: PayeeModel): void;
}>();

// Global scope so `t()` inside computeds re-runs when `mergeLocaleMessage`
// merges a chunk; the default local composer does not track global merges.
const { t } = useI18n({ useScope: 'global' });
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const isOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
});

const isEdit = computed(() => props.payee !== null);

const { formattedCategories } = storeToRefs(useCategoriesStore());

interface ModeOption {
  value: CATEGORIZATION_MODE;
  label: string;
  hint: string;
}

const categorizationModeOptions = computed<ModeOption[]>(() => [
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

const form = reactive<{
  name: string;
  category: FormattedCategory | null;
  categorizationMode: ModeOption;
  /** Manually chosen brand or monogram (create mode only). null = auto-resolve. */
  logo: LogoSelection | null;
}>({
  name: '',
  category: null,
  // Default is `enforce` – matches the backend default for new Payees.
  categorizationMode: categorizationModeOptions.value[0]!,
  logo: null,
});

// Resolved against the live options array instead of reading
// `form.categorizationMode.hint` directly, because that field is a snapshot
// taken when the option was selected – once `pages/payees` finishes loading
// and the labels re-translate, the snapshot's hint is stale.
const activeModeHint = computed(
  () =>
    categorizationModeOptions.value.find((opt) => opt.value === form.categorizationMode.value)?.hint ??
    form.categorizationMode.hint,
);

// A name collision is the one failure the user can act on from inside the dialog, so it
// lands on the field rather than in a toast that closes over the form.
const nameError = ref<string | null>(null);

watch(
  () => form.name,
  () => {
    nameError.value = null;
  },
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    nameError.value = null;
    form.name = props.payee?.name ?? props.initialName ?? '';
    const defaultCatId = props.payee?.defaultCategoryId ?? null;
    form.category = defaultCatId ? (formattedCategories.value.find((c) => c.id === defaultCatId) ?? null) : null;
    const existingMode = props.payee?.categorizationMode ?? CATEGORIZATION_MODE.enforce;
    form.categorizationMode =
      categorizationModeOptions.value.find((opt) => opt.value === existingMode) ?? categorizationModeOptions.value[0]!;
    // Logo picker is create-only; reset so a reopened dialog starts auto-resolving.
    form.logo = null;
  },
  { immediate: true },
);

const createMut = useCreatePayee();
const updateMut = useUpdatePayee();
const isPending = computed(() => createMut.isPending.value || updateMut.isPending.value);

async function handleSave() {
  nameError.value = null;
  try {
    let saved: PayeeModel;
    if (isEdit.value && props.payee) {
      saved = await updateMut.mutateAsync({
        id: props.payee.id,
        payload: {
          name: form.name,
          defaultCategoryId: form.category?.id ?? null,
          categorizationMode: form.categorizationMode.value,
        },
      });
      addSuccessNotification(t('payees.toasts.updated'));
    } else {
      saved = await createMut.mutateAsync({
        name: form.name,
        defaultCategoryId: form.category?.id ?? null,
        categorizationMode: form.categorizationMode.value,
        // No selection omits the logo keys so the new payee keeps auto-resolving.
        ...toOptionalLogoPayload({ selection: form.logo }),
      });
      addSuccessNotification(t('payees.toasts.created'));
    }
    emit('saved', saved);
    isOpen.value = false;
  } catch (error) {
    // 409 means the name is already taken — either another payee's canonical name or an
    // alias of one. The server's message names the offender, so show it verbatim.
    if (isApiErrorWithCode(error, API_ERROR_CODES.conflict)) {
      nameError.value = error.data.message ?? t('payees.errors.generic');
      return;
    }
    if (error instanceof ApiErrorResponseError) {
      addErrorNotification(error.data.message ?? t('payees.errors.generic'));
      return;
    }
    // Non-API failure (network layer, client-side bug) — report it so the generic toast
    // isn't the only trace.
    captureException({ error, context: { flow: isEdit.value ? 'updatePayee' : 'createPayee' } });
    addErrorNotification(t('payees.errors.generic'));
  }
}
</script>
