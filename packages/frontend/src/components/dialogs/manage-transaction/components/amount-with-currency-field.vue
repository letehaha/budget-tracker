<script lang="ts" setup>
import { FieldLabel, InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import * as Select from '@/components/lib/ui/select';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { formatUIAmount } from '@/js/helpers';
import { cn } from '@/lib/utils';
import { type CurrencyModel } from '@bt/shared/types';
import { format } from 'date-fns';
import { debounce } from 'lodash-es';
import { Loader2Icon, SparklesIcon, XIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

import LabelPill from './label-pill.vue';

const NONE_KEY = '__none__';

const props = withDefaults(
  defineProps<{
    amount?: number | null;
    currency?: CurrencyModel | null;
    currencies: CurrencyModel[];
    optionLabel: (value: CurrencyModel) => string;
    label: string;
    placeholder?: string;
    disabled?: boolean;
    suggestVisible?: boolean;
    suggestPending?: boolean;
    suggestedAmount?: number | null;
    suggestedDate?: Date;
  }>(),
  {
    amount: null,
    currency: null,
    placeholder: undefined,
    disabled: false,
    suggestVisible: false,
    suggestPending: false,
    suggestedAmount: null,
    suggestedDate: undefined,
  },
);

const emit = defineEmits<{
  'update:amount': [value: number | null];
  'update:currency': [value: CurrencyModel | null];
  'apply-suggestion': [];
}>();

const searchQuery = ref('');
const debouncedFilteredValues = ref<CurrencyModel[]>(props.currencies);

// reka-ui SelectContent teleports its slot into a DocumentFragment while closed, so
// all 100+ currency items would mount even if the select is never opened.
const hasOpened = ref(false);
const renderedValues = computed(() => (hasOpened.value ? debouncedFilteredValues.value : []));

function onOpenChange(open: boolean) {
  if (open) hasOpened.value = true;
}

const selectedKey = computed({
  get: () => props.currency?.code ?? '',
  set: (key: string) => {
    searchQuery.value = '';
    if (!key || key === NONE_KEY) {
      emit('update:currency', null);
      return;
    }
    emit('update:currency', props.currencies.find((item) => item.code === key) ?? null);
  },
});

const onAmountUpdate = (value: string | number | null) => {
  emit('update:amount', value === '' || value == null ? null : Number(value));
};

const hintAmount = computed(() =>
  props.suggestedAmount == null ? '' : formatUIAmount(props.suggestedAmount, { currency: props.currency?.code }),
);
const hintDate = computed(() => (props.suggestedDate ? format(props.suggestedDate, 'd MMM') : ''));

watch(
  searchQuery,
  debounce((query: string) => {
    const lowerCaseQuery = query.toLowerCase();
    debouncedFilteredValues.value = props.currencies.filter(
      (item) =>
        props.optionLabel(item).toLowerCase().includes(lowerCaseQuery) ||
        item.code.toLowerCase().includes(lowerCaseQuery),
    );
  }, 300),
);

watch(
  () => props.currencies,
  (newValues) => {
    if (!searchQuery.value) {
      debouncedFilteredValues.value = newValues;
    }
  },
  { immediate: true },
);
</script>

<template>
  <FieldLabel :label="label" only-template>
    <template v-if="suggestVisible" #label-right>
      <DesktopOnlyTooltip :content="$t('dialogs.manageTransaction.form.originalAmountSuggest')">
        <LabelPill
          :disabled="disabled || suggestPending"
          :aria-label="$t('dialogs.manageTransaction.form.originalAmountSuggest')"
          @click="emit('apply-suggestion')"
        >
          <Loader2Icon v-if="suggestPending" class="size-3 animate-spin" />
          <SparklesIcon v-else class="size-3" />
          {{ $t('dialogs.manageTransaction.form.originalAmountSuggestPill') }}
        </LabelPill>
      </DesktopOnlyTooltip>
    </template>

    <div
      :class="
        cn(
          'border-input bg-input-background focus-within:border-ring flex h-10 w-full items-stretch overflow-hidden rounded-md border md:h-9',
          disabled && 'opacity-50',
        )
      "
    >
      <div class="grid min-w-0 flex-1 items-center">
        <InputField
          :model-value="amount"
          type="number"
          only-positive
          :placeholder="placeholder"
          :disabled="disabled"
          :aria-label="label"
          class="rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          @update:model-value="onAmountUpdate"
        />
      </div>

      <Select.Select v-model="selectedKey" :disabled="disabled" @update:open="onOpenChange">
        <Select.SelectTrigger
          class="border-input hover:text-foreground h-auto w-auto shrink-0 gap-1 rounded-none border-0 border-l bg-transparent px-2.5 text-[13px] focus:ring-0 focus:ring-offset-0 md:h-auto"
          :aria-label="$t('dialogs.manageTransaction.form.originalCurrencyLabel')"
        >
          <span v-if="currency">{{ currency.code }}</span>
          <span v-else class="text-muted-foreground">{{
            $t('dialogs.manageTransaction.form.originalCurrencyTriggerEmpty')
          }}</span>
        </Select.SelectTrigger>

        <Select.SelectContent class="min-w-56">
          <template v-if="hasOpened" #header>
            <div class="border-border border-b p-2">
              <InputField
                v-model="searchQuery"
                type="text"
                :placeholder="$t('fields.select.searchPlaceholder')"
                trailing-icon-css-class="px-0"
                @keydown.stop
              >
                <template #iconTrailing>
                  <template v-if="searchQuery">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      :aria-label="$t('common.components.selectField.clearSelection')"
                      @click="searchQuery = ''"
                    >
                      <XIcon class="size-4" />
                    </Button>
                  </template>
                </template>
              </InputField>
            </div>
          </template>

          <Select.SelectItem v-if="currency" :value="NONE_KEY" class="text-muted-foreground">
            {{ $t('dialogs.manageTransaction.form.originalCurrencyNone') }}
          </Select.SelectItem>

          <Select.SelectItem v-for="item in renderedValues" :key="item.code" :value="item.code">
            {{ optionLabel(item) }}
          </Select.SelectItem>
        </Select.SelectContent>
      </Select.Select>
    </div>

    <Button
      v-if="suggestVisible && suggestedAmount != null"
      type="button"
      variant="ghost"
      class="text-primary-text hover:text-primary-text mt-1.5 h-auto justify-start gap-1 p-0 text-xs font-normal hover:bg-transparent"
      @click="emit('apply-suggestion')"
    >
      <SparklesIcon class="size-3" />
      <span class="tabular-nums">{{
        $t('dialogs.manageTransaction.form.originalAmountSuggestHint', { amount: hintAmount, date: hintDate })
      }}</span>
      <span aria-hidden="true">·</span>
      <span class="underline">{{ $t('dialogs.manageTransaction.form.originalAmountSuggestApply') }}</span>
    </Button>
  </FieldLabel>
</template>
