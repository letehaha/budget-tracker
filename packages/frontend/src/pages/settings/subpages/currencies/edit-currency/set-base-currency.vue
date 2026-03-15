<template>
  <div class="flex items-center justify-between gap-4">
    <p class="text-sm opacity-90">
      {{ $t('settings.currencies.setBase.label') }}

      <ui-tooltip position="top">
        <template #tooltip-message>
          {{ $t('settings.currencies.setBase.tooltip') }}
        </template>
        <InfoIcon class="inline size-4" />
      </ui-tooltip>
    </p>

    <Button variant="destructive" @click="showBaseCurrencyDialog = true" :disabled="isFormDisabled" class="min-w-42.75">
      <template v-if="changeBaseCurrencyMutation.isPending.value">
        {{ $t('settings.currencies.setBase.processing') }}
      </template>
      <template v-else> {{ $t('settings.currencies.setBase.button') }} </template>
    </Button>
  </div>

  <AlertDialog.AlertDialog :open="showBaseCurrencyDialog" @update:open="showBaseCurrencyDialog = $event">
    <AlertDialog.AlertDialogContent>
      <AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogTitle>{{
          $t('settings.currencies.setBase.dialog.title')
        }}</AlertDialog.AlertDialogTitle>
        <AlertDialog.AlertDialogDescription class="grid gap-4">
          <p>
            <strong class="text-warning font-bold">{{ $t('settings.currencies.setBase.dialog.warningTitle') }}</strong>
            {{ $t('settings.currencies.setBase.dialog.warningText') }}
          </p>

          <p>
            {{ $t('settings.currencies.setBase.dialog.descriptionText') }}
          </p>

          <Collapsible.Collapsible v-model:open="showRoundingDetails">
            <Collapsible.CollapsibleTrigger class="flex items-center gap-1 text-sm hover:opacity-80">
              <ChevronDownIcon
                class="size-4 transition-transform duration-200"
                :class="{ 'rotate-180': showRoundingDetails }"
              />
              {{ $t('settings.currencies.setBase.dialog.roundingTitle') }}
            </Collapsible.CollapsibleTrigger>
            <Collapsible.CollapsibleContent class="mt-2 text-sm opacity-90">
              <div class="rounded-md bg-white/5 p-3">
                <p class="mb-2">
                  {{ $t('settings.currencies.setBase.dialog.roundingIntro') }}
                </p>
                <p class="mb-2">
                  <strong>{{ $t('settings.currencies.setBase.dialog.roundingHow') }}</strong>
                  <br />
                  • {{ $t('settings.currencies.setBase.dialog.roundingRule1') }}<br />
                  • {{ $t('settings.currencies.setBase.dialog.roundingRule2') }}
                </p>
                <p>
                  {{ $t('settings.currencies.setBase.dialog.roundingStandard') }}
                </p>
              </div>
            </Collapsible.CollapsibleContent>
          </Collapsible.Collapsible>

          <strong class="text-warning font-bold">
            <TriangleAlertIcon class="inline size-4 align-text-bottom" />
            {{ $t('settings.currencies.setBase.dialog.untouchedWarning') }}
          </strong>

          <strong class="font-bold">
            <InfoIcon class="inline size-4" />
            {{ $t('settings.currencies.setBase.dialog.processingTimeInfo') }}
          </strong>

          <strong class="text-warning font-bold">
            <TriangleAlertIcon class="inline size-4" />
            {{ $t('settings.currencies.setBase.dialog.restrictionWarning') }}
          </strong>

          <p>{{ $t('settings.currencies.setBase.dialog.confirmation') }}</p>
        </AlertDialog.AlertDialogDescription>
      </AlertDialog.AlertDialogHeader>
      <AlertDialog.AlertDialogFooter>
        <AlertDialog.AlertDialogAction variant="destructive" @click="makeBaseCurrency">
          {{ $t('settings.currencies.setBase.dialog.changeButton') }}
        </AlertDialog.AlertDialogAction>

        <AlertDialog.AlertDialogCancel>
          {{ $t('settings.currencies.setBase.dialog.cancelButton') }}
        </AlertDialog.AlertDialogCancel>
      </AlertDialog.AlertDialogFooter>
    </AlertDialog.AlertDialogContent>
  </AlertDialog.AlertDialog>
</template>

<script setup lang="ts">
import UiTooltip from '@/components/common/tooltip.vue';
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Collapsible from '@/components/lib/ui/collapsible';
import { useNotificationCenter } from '@/components/notification-center';
import { useChangeBaseCurrency } from '@/composable/data-queries/currencies';
import { API_ERROR_CODES } from '@bt/shared/types';
import { ChevronDownIcon, InfoIcon, TriangleAlertIcon } from 'lucide-vue-next';
import { reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { CurrencyWithExchangeRate } from '../types';

const calculateRatio = (value: number) => {
  const exp = 10 ** 6;
  const num = 1 / value;
  const result = Math.round(num * exp) / exp;

  return Number.isFinite(result) ? result : 0;
};

const props = defineProps<{
  currency: CurrencyWithExchangeRate;
  isFormDisabled: boolean;
}>();

const emit = defineEmits<{
  submit: [];
  'trigger-disabled': [value: boolean];
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const changeBaseCurrencyMutation = useChangeBaseCurrency();
const { t } = useI18n();

const form = reactive({
  baseRate: props.currency.rate,
  quoteRate: props.currency.quoteRate,
});
const isBaseEditing = ref(false);
const isQuoteEditing = ref(false);
const showBaseCurrencyDialog = ref(false);
const showRoundingDetails = ref(false);

watch(
  () => form.baseRate,
  (value) => {
    if (isBaseEditing.value) {
      form.quoteRate = calculateRatio(value);
    }
  },
);
watch(
  () => form.quoteRate,
  (value) => {
    if (isQuoteEditing.value) {
      form.baseRate = calculateRatio(value);
    }
  },
);

const makeBaseCurrency = async () => {
  try {
    emit('trigger-disabled', true);
    await changeBaseCurrencyMutation.mutateAsync(props.currency.currency!.code);

    addSuccessNotification(t('settings.currencies.setBase.successMessage'));

    emit('trigger-disabled', false);
    emit('submit');
  } catch (e: unknown) {
    if ((e as any)?.data?.code === API_ERROR_CODES.validationError) {
      addErrorNotification((e as any).data.message);
      return;
    }
    addErrorNotification(t('settings.currencies.setBase.errors.changeFailed'));
  }
};
</script>
