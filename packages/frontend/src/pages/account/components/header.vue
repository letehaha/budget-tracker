<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/common/dropdown-menu';
import PortfolioTransferDialog from '@/components/dialogs/portfolio-transfer-dialog.vue';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { CardHeader } from '@/components/lib/ui/card';
import * as Popover from '@/components/lib/ui/popover';
import * as Tooltip from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormValidation } from '@/composable';
import { toLocalNumber } from '@/js/helpers';
import * as validators from '@/js/helpers/validators';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { ACCOUNT_TYPES, AccountModel } from '@bt/shared/types';
import { ArrowRightLeftIcon, MoreVerticalIcon, PencilIcon, ScaleIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import BalanceAdjustmentDialog from './balance-adjustment-dialog.vue';

const props = defineProps<{
  account: AccountModel;
}>();
const { currenciesMap, baseCurrency } = storeToRefs(useCurrenciesStore());
const accountsStore = useAccountsStore();
const formEditingPopoverOpen = ref(false);
const adjustmentDialogOpen = ref(false);
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { t } = useI18n();

const isSystemAccount = computed(() => props.account.type === ACCOUNT_TYPES.system);

const accountNameForm = ref({
  name: props.account.name,
});
const { isFormValid, touchField, getFieldErrorMessage, resetValidation } = useFormValidation(
  { form: accountNameForm },
  {
    form: {
      name: {
        required: validators.required,
        minLength: validators.minLength(2),
      },
    },
  },
);

/**
 * Guard to prevent the dropdown's dismiss cascade from immediately
 * closing the popover. When the dropdown closes it fires pointer /
 * focus-outside events that the Popover picks up via @update:open.
 */
let openedFromDropdownAt = 0;

const openRenameFromDropdown = () => {
  openedFromDropdownAt = Date.now();
  formEditingPopoverOpen.value = true;
};

const onPopoverOpenChange = (value: boolean) => {
  if (!value && Date.now() - openedFromDropdownAt < 200) return;
  formEditingPopoverOpen.value = value;
};

const updateAccount = async () => {
  if (!isFormValid()) return;

  try {
    await accountsStore.editAccount({
      id: props.account.id,
      name: accountNameForm.value.name,
    });

    formEditingPopoverOpen.value = false;
    addSuccessNotification(t('pages.account.header.updateSuccess'));
  } catch {
    addErrorNotification(t('pages.account.header.updateError'));
  }
};

// Reset form when popover opens or when account changes
watch([formEditingPopoverOpen, () => props.account.id], () => {
  accountNameForm.value.name = props.account.name;
  resetValidation();
});
</script>

<template>
  <CardHeader>
    <div class="flex flex-col">
      <div class="flex w-full justify-between gap-4">
        <!-- Account name — click to open rename popover -->
        <Popover.Popover :open="formEditingPopoverOpen" @update:open="onPopoverOpenChange">
          <Popover.PopoverTrigger as-child>
            <button class="flex cursor-pointer text-xl transition-opacity hover:opacity-80">
              {{ account.name }}
            </button>
          </Popover.PopoverTrigger>
          <Popover.PopoverContent>
            <form class="grid gap-6" @submit.prevent="updateAccount">
              <InputField
                v-model="accountNameForm.name"
                :label="$t('pages.account.header.nameLabel')"
                :placeholder="$t('pages.account.header.namePlaceholder')"
                :error-message="getFieldErrorMessage('form.name')"
                @blur="touchField('form.name')"
              />

              <Button type="submit" :disabled="accountNameForm.name === account.name || !accountNameForm.name.trim()">
                {{ t('pages.account.header.save') }}
              </Button>
            </form>
          </Popover.PopoverContent>
        </Popover.Popover>

        <div class="flex gap-2">
          <PortfolioTransferDialog :account="account" context="account">
            <Button variant="ghost" size="icon" :title="t('pages.account.header.transferToPortfolio')">
              <ArrowRightLeftIcon :size="20" />
            </Button>
          </PortfolioTransferDialog>

          <!-- Kebab dropdown (separate flex item so floating-ui has a clean reference) -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon" :title="t('pages.account.header.accountActions')">
                <MoreVerticalIcon :size="20" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem class="gap-2" @click="openRenameFromDropdown">
                <PencilIcon class="size-4" />
                {{ t('pages.account.header.renameAccount') }}
              </DropdownMenuItem>

              <Tooltip.TooltipProvider>
                <Tooltip.Tooltip :delay-duration="0">
                  <Tooltip.TooltipTrigger as-child>
                    <span class="block">
                      <DropdownMenuItem
                        class="gap-2"
                        :disabled="!isSystemAccount"
                        :class="!isSystemAccount ? 'pointer-events-none' : ''"
                        @click="isSystemAccount && (adjustmentDialogOpen = true)"
                      >
                        <ScaleIcon class="size-4" />
                        {{ t('pages.account.header.adjustBalance') }}
                      </DropdownMenuItem>
                    </span>
                  </Tooltip.TooltipTrigger>
                  <Tooltip.TooltipContent v-if="!isSystemAccount">
                    {{ t('pages.account.header.adjustBalanceTooltip') }}
                  </Tooltip.TooltipContent>
                </Tooltip.Tooltip>
              </Tooltip.TooltipProvider>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <!-- Balance -->
      <div class="flex items-center">
        <button
          v-if="isSystemAccount"
          class="flex cursor-pointer flex-wrap items-end justify-start gap-x-2 transition-opacity hover:opacity-75"
          @click="adjustmentDialogOpen = true"
        >
          <span class="text-amount text-3xl">
            {{ toLocalNumber(account.currentBalance) }}
            {{ currenciesMap[account.currencyCode]?.currency?.code }}
          </span>
          <span v-if="baseCurrency && account.currencyCode !== baseCurrency.currencyCode" class="text-white opacity-50">
            ~
            {{ toLocalNumber(account.refCurrentBalance) }}
            {{ baseCurrency.currency?.code }}
          </span>
        </button>
        <div v-else class="flex flex-wrap items-end justify-start gap-2">
          <span class="text-amount text-3xl">
            {{ toLocalNumber(account.currentBalance) }}
            {{ currenciesMap[account.currencyCode]?.currency?.code }}
          </span>
          <span v-if="baseCurrency && account.currencyCode !== baseCurrency.currencyCode" class="text-white opacity-50">
            ~
            {{ toLocalNumber(account.refCurrentBalance) }}
            {{ baseCurrency.currency?.code }}
          </span>
        </div>
      </div>
    </div>

    <BalanceAdjustmentDialog v-if="adjustmentDialogOpen" :account="account" @close="adjustmentDialogOpen = false" />
  </CardHeader>
</template>
