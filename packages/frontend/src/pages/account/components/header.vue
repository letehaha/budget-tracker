<script setup lang="ts">
import PortfolioTransferDialog from '@/components/dialogs/portfolio-transfer-dialog.vue';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { CardHeader } from '@/components/lib/ui/card';
import * as Popover from '@/components/lib/ui/popover';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormValidation } from '@/composable';
import { toLocalNumber } from '@/js/helpers';
import * as validators from '@/js/helpers/validators';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { ArrowRightLeftIcon, Edit2Icon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  account: AccountModel;
}>();
const { currenciesMap, baseCurrency } = storeToRefs(useCurrenciesStore());
const accountsStore = useAccountsStore();
const formEditingPopoverOpen = ref(false);
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { t } = useI18n();

const accountNameForm = ref({
  name: props.account.name,
});
const { isFormValid, getFieldErrorMessage } = useFormValidation(
  { form: accountNameForm },
  {
    form: {
      name: {
        required: validators.required,
        minLength: validators.minLength(2),
        notSameAs: validators.not(validators.sameAs(props.account.name)),
      },
    },
  },
);

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
});
</script>

<template>
  <CardHeader>
    <div class="flex flex-wrap items-start justify-between">
      <div class="flex items-center gap-2">
        <span class="text-xl">
          {{ account.name }}
        </span>

        <div class="flex items-center gap-1">
          <PortfolioTransferDialog :account="account" context="account">
            <Button variant="ghost" size="icon" :title="t('pages.account.header.transferToPortfolio')">
              <ArrowRightLeftIcon :size="20" />
            </Button>
          </PortfolioTransferDialog>

          <Popover.Popover :open="formEditingPopoverOpen" @update:open="formEditingPopoverOpen = $event">
            <Popover.PopoverTrigger>
              <Button variant="ghost" size="icon" :title="t('pages.account.header.editAccountName')">
                <Edit2Icon :size="20" />
              </Button>
            </Popover.PopoverTrigger>
            <Popover.PopoverContent>
              <form class="grid gap-6" @submit.prevent="updateAccount">
                <InputField
                  v-model="accountNameForm.name"
                  :label="$t('pages.account.header.nameLabel')"
                  :placeholder="$t('pages.account.header.namePlaceholder')"
                  :error-message="getFieldErrorMessage('form.name')"
                />

                <Button type="submit" :disabled="accountNameForm.name === account.name">
                  {{ t('pages.account.header.save') }}
                </Button>
              </form>
            </Popover.PopoverContent>
          </Popover.Popover>
        </div>
      </div>
      <div class="ml-auto flex flex-wrap items-end justify-start gap-2">
        <span v-if="account.currencyCode !== baseCurrency.currencyCode" class="text-opacity-50 text-white">
          ~
          {{ toLocalNumber(account.refCurrentBalance) }}
          {{ baseCurrency.currency.code }}
        </span>
        <span class="text-3xl">
          {{ toLocalNumber(account.currentBalance) }}
          {{ currenciesMap[account.currencyCode].currency.code }}
        </span>
      </div>
    </div>
  </CardHeader>
</template>
