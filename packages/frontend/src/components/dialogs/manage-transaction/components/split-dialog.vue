<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="max-h-[85vh] overflow-hidden sm:max-w-lg" custom-close>
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <SplitIcon class="size-5 opacity-70" />
          Split into categories
        </DialogTitle>
        <DialogDescription>
          Distribute this transaction across multiple categories. The main category keeps any unallocated amount.
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-[50vh] overflow-y-auto py-4">
        <!-- Main category display -->
        <div class="bg-muted/40 border-border mb-4 rounded-lg border p-3">
          <div class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">Main Category</div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="size-3 rounded-full" :style="{ backgroundColor: mainCategory?.color || '#666' }" />
              <span class="font-medium">{{ mainCategory?.name || 'Select category' }}</span>
            </div>
            <span class="text-muted-foreground text-sm tabular-nums">
              {{ formatUIAmount(mainCategoryAmount, { currency: currencyCode }) }}
            </span>
          </div>
        </div>

        <!-- Split rows -->
        <div class="space-y-3">
          <TransitionGroup name="split-list">
            <div
              v-for="(split, index) in localSplits"
              :key="split.tempId ?? split.id ?? `split-${index}`"
              class="group"
            >
              <div
                class="bg-muted/20 border-border/60 grid grid-cols-[1fr_auto_auto] items-start gap-2 rounded-lg border p-3 transition-colors"
                :class="{ 'border-destructive/50 bg-destructive/5': getSplitError(index) }"
              >
                <!-- Category selector -->
                <div class="min-w-0">
                  <CategorySelectField
                    :model-value="split.category"
                    :values="categories"
                    placeholder="Category"
                    class="[&_button]:h-9 [&_button]:text-sm"
                    @update:model-value="(cat) => updateSplit(index, { category: cat })"
                  />
                </div>

                <!-- Amount input -->
                <div class="w-28">
                  <div class="relative">
                    <input
                      :value="split.amount ?? ''"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 py-1 pr-10 text-right text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                      @input="(e) => updateSplitAmount(index, (e.target as HTMLInputElement).value)"
                    />
                    <span
                      class="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs"
                    >
                      {{ currencyCode }}
                    </span>
                  </div>
                </div>

                <!-- Remove button -->
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  class="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9 w-9 p-0"
                  @click="removeSplit(index)"
                >
                  <XIcon class="size-4" />
                </Button>
              </div>

              <!-- Split error message -->
              <p v-if="getSplitError(index)" class="text-destructive mt-1 px-1 text-xs">
                {{ getSplitError(index) }}
              </p>
            </div>
          </TransitionGroup>
        </div>

        <!-- Add split button -->
        <Button variant="outline" size="sm" type="button" class="mt-3 w-full border-dashed" @click="addSplit">
          <PlusIcon class="mr-1.5 size-3.5" />
          Add category
        </Button>

        <!-- Summary -->
        <div class="border-border mt-4 border-t pt-4">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Total amount</span>
            <span class="font-medium tabular-nums">
              {{ formatUIAmount(totalAmount ?? 0, { currency: currencyCode }) }}
            </span>
          </div>
          <div class="mt-2 flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Split total</span>
            <span class="font-medium tabular-nums">
              {{ formatUIAmount(splitsTotal, { currency: currencyCode }) }}
            </span>
          </div>
          <div class="mt-2 flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Main category keeps</span>
            <span
              class="font-medium tabular-nums"
              :class="{
                'text-destructive': mainCategoryAmount < 0,
                'text-success-text': mainCategoryAmount >= 0,
              }"
            >
              {{ formatUIAmount(mainCategoryAmount, { currency: currencyCode }) }}
            </span>
          </div>
          <p v-if="mainCategoryAmount < 0" class="text-destructive mt-2 text-xs">
            Split amounts exceed transaction total
          </p>
        </div>
      </div>

      <DialogFooter class="gap-2 sm:gap-0">
        <Button variant="outline" @click="handleCancel"> Cancel </Button>
        <Button variant="destructive" v-if="hasExistingSplits" @click="handleClearAll"> Remove splits </Button>
        <Button :disabled="!isValid" @click="handleSave"> Save splits </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import type { FormattedCategory } from '@/common/types';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import { Button } from '@/components/lib/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/lib/ui/dialog';
import { formatUIAmount } from '@/js/helpers';
import { useCategoriesStore } from '@/stores';
import { PlusIcon, SplitIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

import type { FormSplit } from '../types';

interface LocalSplit extends FormSplit {
  tempId?: string;
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
  category: undefined as unknown as FormattedCategory,
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

const updateSplit = (index: number, updates: Partial<FormSplit>) => {
  const newSplits = [...localSplits.value];
  newSplits[index] = { ...newSplits[index], ...updates };
  localSplits.value = newSplits;
};

const updateSplitAmount = (index: number, value: string) => {
  const numValue = value === '' ? null : parseFloat(value);
  updateSplit(index, { amount: numValue });
};

const getSplitError = (index: number): string | null => {
  const split = localSplits.value[index];
  if (!split) return null;

  if (split.amount !== null && split.amount < 0) {
    return 'Amount must be positive';
  }

  // Check for duplicate categories
  if (split.category) {
    const duplicates = localSplits.value.filter((s, i) => i !== index && s.category?.id === split.category?.id);
    if (duplicates.length > 0) {
      return 'Duplicate category';
    }

    // Check if using main category
    if (props.mainCategory && split.category.id === props.mainCategory.id) {
      return 'Cannot use main category in splits';
    }
  }

  return null;
};

const handleSave = () => {
  // Filter to only valid splits and remove tempId
  const validSplits: FormSplit[] = localSplits.value
    .filter((split) => split.category && split.amount !== null && split.amount > 0)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ tempId, ...split }) => split);

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

<style scoped>
.split-list-enter-active,
.split-list-leave-active {
  transition: all 0.2s ease;
}

.split-list-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.split-list-leave-to {
  opacity: 0;
  transform: translateX(8px);
}
</style>
