<script lang="ts" setup>
import type { FormattedCategory } from '@/common/types';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { formatUIAmount } from '@/js/helpers';
import { useCategoriesStore } from '@/stores';
import { PlusIcon, SplitIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import type { FormSplit } from '../types';

const { t } = useI18n();

interface LocalSplit extends Omit<FormSplit, 'category'> {
  tempId?: string;
  category: FormattedCategory | null;
}

const props = defineProps<{
  modelValue: FormSplit[] | undefined;
  totalAmount: number | null;
  currencyCode: string | undefined;
  mainCategory: FormattedCategory | undefined;
}>();

const emit = defineEmits<{
  'update:modelValue': [splits: FormSplit[] | undefined];
}>();

const isOpen = defineModel<boolean>('open', { default: false });

const { formattedCategories } = storeToRefs(useCategoriesStore());
const categories = computed(() => formattedCategories.value);

// Local state for editing
const localSplits = ref<LocalSplit[]>([]);
let tempIdCounter = 0;

const generateTempId = () => `temp-${++tempIdCounter}`;

// Initialize local state when dialog opens
watch(isOpen, (open) => {
  if (open) {
    if (props.modelValue && props.modelValue.length > 0) {
      localSplits.value = props.modelValue.map((split) => ({
        ...split,
        tempId: split.id ?? generateTempId(),
      }));
    } else {
      // Start with one empty split
      localSplits.value = [createEmptySplit()];
    }
  }
});

const hasExistingSplits = computed(() => props.modelValue && props.modelValue.length > 0);

const splitsTotal = computed(() => {
  return localSplits.value.reduce((sum, split) => sum + (split.amount ?? 0), 0);
});

const mainCategoryAmount = computed(() => {
  const total = props.totalAmount ?? 0;
  return total - splitsTotal.value;
});

const isValid = computed(() => {
  // Must have at least one valid split
  const validSplits = localSplits.value.filter((split) => split.category && split.amount !== null && split.amount > 0);
  if (validSplits.length === 0) return false;

  // Main category amount must be non-negative
  if (mainCategoryAmount.value < 0) return false;

  // No duplicate categories
  const categoryIds = validSplits.map((s) => s.category?.id);
  const uniqueIds = new Set(categoryIds);
  if (uniqueIds.size !== categoryIds.length) return false;

  // No split should use the main category
  if (props.mainCategory && validSplits.some((s) => s.category?.id === props.mainCategory?.id)) {
    return false;
  }

  return true;
});

const createEmptySplit = (): LocalSplit => ({
  tempId: generateTempId(),
  category: null,
  amount: null,
  note: null,
});

const addSplit = () => {
  localSplits.value = [...localSplits.value, createEmptySplit()];
};

const removeSplit = (index: number) => {
  localSplits.value = localSplits.value.filter((_, i) => i !== index);
  if (localSplits.value.length === 0) {
    localSplits.value = [createEmptySplit()];
  }
};

const updateSplit = (index: number, updates: Partial<LocalSplit>) => {
  const newSplits = [...localSplits.value];
  newSplits[index] = { ...newSplits[index], ...updates };
  localSplits.value = newSplits;
};

const updateSplitAmount = (index: number, value: number | string | null) => {
  const numValue = value === '' || value === null ? null : Number(value);
  updateSplit(index, { amount: numValue });
};

const getSplitError = (index: number): string | null => {
  const split = localSplits.value[index];
  if (!split) return null;

  if (split.amount !== null && split.amount < 0) {
    return t('dialogs.manageTransaction.splitDialog.errors.amountMustBePositive');
  }

  // Check for duplicate categories
  if (split.category) {
    const duplicates = localSplits.value.filter((s, i) => i !== index && s.category?.id === split.category?.id);
    if (duplicates.length > 0) {
      return t('dialogs.manageTransaction.splitDialog.errors.duplicateCategory');
    }

    // Check if using main category
    if (props.mainCategory && split.category.id === props.mainCategory.id) {
      return t('dialogs.manageTransaction.splitDialog.errors.cannotUseMainCategory');
    }
  }

  return null;
};

const handleSave = () => {
  // Filter to only valid splits and remove tempId
  const validSplits: FormSplit[] = localSplits.value
    .filter((split) => split.category && split.amount !== null && split.amount > 0)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ tempId, ...split }) => split as FormSplit);

  emit('update:modelValue', validSplits.length > 0 ? validSplits : undefined);
  isOpen.value = false;
};

const handleCancel = () => {
  isOpen.value = false;
};

const handleClearAll = () => {
  emit('update:modelValue', undefined);
  isOpen.value = false;
};
</script>

<template>
  <ResponsiveDialog
    v-model:open="isOpen"
    custom-close
    dialog-content-class="max-h-[85vh] overflow-hidden sm:max-w-lg"
    drawer-content-class="max-h-[85dvh]"
  >
    <template #title>
      <span class="flex items-center gap-2">
        <SplitIcon class="size-5 opacity-70" />
        {{ $t('dialogs.manageTransaction.splitDialog.title') }}
      </span>
    </template>
    <template #description>
      {{ $t('dialogs.manageTransaction.splitDialog.description') }}
    </template>

    <div class="max-h-[50vh] overflow-y-auto py-4">
      <!-- Main category display -->
      <div class="bg-muted/40 border-border mb-4 rounded-lg border p-3">
        <div class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
          {{ $t('dialogs.manageTransaction.splitDialog.mainCategoryLabel') }}
        </div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="size-3 rounded-full" :style="{ backgroundColor: mainCategory?.color || '#666' }" />
            <span class="font-medium">
              {{ mainCategory?.name || $t('dialogs.manageTransaction.splitDialog.selectCategoryPlaceholder') }}
            </span>
          </div>
          <span class="text-muted-foreground text-sm tabular-nums">
            {{ formatUIAmount(mainCategoryAmount, { currency: currencyCode }) }}
          </span>
        </div>
      </div>

      <!-- Split rows -->
      <div class="space-y-3">
        <div v-for="(split, index) in localSplits" :key="split.tempId ?? split.id ?? `split-${index}`" class="group">
          <div
            class="bg-muted/20 border-border/60 grid grid-cols-[1fr_9rem_auto] items-start gap-2 rounded-lg border p-3 transition-colors"
            :class="{ 'border-destructive/50 bg-destructive/5': getSplitError(index) }"
          >
            <!-- Category selector -->
            <div class="min-w-0">
              <CategorySelectField
                :model-value="split.category"
                :values="categories"
                :placeholder="$t('dialogs.manageTransaction.splitDialog.selectCategoryPlaceholder')"
                class="[&_button]:h-10 [&_button]:text-sm"
                @update:model-value="(cat) => updateSplit(index, { category: cat })"
              />
            </div>

            <!-- Amount input -->
            <InputField
              :model-value="split.amount"
              type="number"
              only-positive
              :placeholder="$t('dialogs.manageTransaction.splitDialog.amountPlaceholder')"
              trailing-icon-css-class="px-3"
              class="[&_input]:tabular-nums"
              @update:model-value="(val) => updateSplitAmount(index, val)"
            >
              <template #iconTrailing>
                <span class="text-muted-foreground text-xs">{{ currencyCode }}</span>
              </template>
            </InputField>

            <!-- Remove button -->
            <Button variant="ghost-destructive" size="icon" type="button" @click="removeSplit(index)">
              <XIcon class="size-4" />
            </Button>
          </div>

          <!-- Split error message -->
          <p v-if="getSplitError(index)" class="text-destructive mt-1 px-1 text-xs">
            {{ getSplitError(index) }}
          </p>
        </div>
      </div>

      <!-- Add split button -->
      <Button variant="outline" size="sm" type="button" class="mt-3 w-full border-dashed" @click="addSplit">
        <PlusIcon class="mr-1.5 size-3.5" />
        {{ $t('dialogs.manageTransaction.splitDialog.addCategoryButton') }}
      </Button>

      <!-- Summary -->
      <div class="border-border mt-4 border-t pt-4">
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ $t('dialogs.manageTransaction.splitDialog.totalAmountLabel') }}</span>
          <span class="font-medium tabular-nums">
            {{ formatUIAmount(totalAmount ?? 0, { currency: currencyCode }) }}
          </span>
        </div>
        <div class="mt-2 flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ $t('dialogs.manageTransaction.splitDialog.splitTotalLabel') }}</span>
          <span class="font-medium tabular-nums">
            {{ formatUIAmount(splitsTotal, { currency: currencyCode }) }}
          </span>
        </div>
        <div class="mt-2 flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{
            $t('dialogs.manageTransaction.splitDialog.mainCategoryKeepsLabel')
          }}</span>
          <span
            class="font-medium tabular-nums"
            :class="{
              'text-destructive-text': mainCategoryAmount < 0,
              'text-success-text': mainCategoryAmount >= 0,
            }"
          >
            {{ formatUIAmount(mainCategoryAmount, { currency: currencyCode }) }}
          </span>
        </div>
        <p v-if="mainCategoryAmount < 0" class="text-destructive-text mt-2 text-xs">
          {{ $t('dialogs.manageTransaction.splitDialog.exceedsTransactionTotal') }}
        </p>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" class="mr-auto w-full sm:w-auto" @click="handleCancel">
        {{ $t('dialogs.manageTransaction.splitDialog.cancelButton') }}
      </Button>
      <Button v-if="hasExistingSplits" variant="destructive" @click="handleClearAll">
        {{ $t('dialogs.manageTransaction.splitDialog.removeSplitsButton') }}
      </Button>
      <Button :disabled="!isValid" class="w-full sm:w-auto" @click="handleSave">
        {{ $t('dialogs.manageTransaction.splitDialog.saveSplitsButton') }}
      </Button>
    </template>
  </ResponsiveDialog>
</template>
