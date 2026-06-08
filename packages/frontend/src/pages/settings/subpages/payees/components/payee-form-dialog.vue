<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #default>
      <div class="flex flex-col gap-4 p-4">
        <h3 class="text-lg font-semibold">
          {{ isEdit ? $t('payees.actions.rename') : $t('payees.newPayeeButton') }}
        </h3>

        <InputField
          v-model="form.name"
          :label="$t('payees.columns.name')"
          :placeholder="$t('payees.form.namePlaceholder')"
        />

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
import CategorySelectField from '@/components/fields/category-select-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import { Button } from '@/components/lib/ui/button';
import { CATEGORIZATION_MODE, PayeeModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';

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
}>({
  name: '',
  category: null,
  // Default is `enforce` – matches the backend default for new Payees.
  categorizationMode: categorizationModeOptions.value[0]!,
});

// Resolved against the live options array instead of reading
// `form.categorizationMode.hint` directly, because that field is a snapshot
// taken when the option was selected — once `pages/payees` finishes loading
// and the labels re-translate, the snapshot's hint is stale.
const activeModeHint = computed(
  () =>
    categorizationModeOptions.value.find((opt) => opt.value === form.categorizationMode.value)?.hint ??
    form.categorizationMode.hint,
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    form.name = props.payee?.name ?? props.initialName ?? '';
    const defaultCatId = props.payee?.defaultCategoryId ?? null;
    form.category = defaultCatId ? (formattedCategories.value.find((c) => c.id === defaultCatId) ?? null) : null;
    const existingMode = props.payee?.categorizationMode ?? CATEGORIZATION_MODE.enforce;
    form.categorizationMode =
      categorizationModeOptions.value.find((opt) => opt.value === existingMode) ?? categorizationModeOptions.value[0]!;
  },
  { immediate: true },
);

const createMut = useCreatePayee();
const updateMut = useUpdatePayee();
const isPending = computed(() => createMut.isPending.value || updateMut.isPending.value);

async function handleSave() {
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
      });
      addSuccessNotification(t('payees.toasts.created'));
    }
    emit('saved', saved);
    isOpen.value = false;
  } catch (err) {
    addErrorNotification(t('payees.errors.generic'));
  }
}
</script>
