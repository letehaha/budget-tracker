<script setup lang="ts">
import { InputField } from '@/components/fields';
import PortfolioTransferDialog from '@/components/dialogs/portfolio-transfer-dialog.vue';
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

const props = defineProps<{
  account: AccountModel;
}>();
const { currenciesMap, baseCurrency } = storeToRefs(useCurrenciesStore());
const accountsStore = useAccountsStore();
const formEditingPopoverOpen = ref(false);
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

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
    addSuccessNotification('Account data changed successfully');
  } catch {
    addErrorNotification('An error occured while trying to update account');
  }
};

// Reset form when popover opens or when account changes
watch([formEditingPopoverOpen, () => props.account.id], () => {
  accountNameForm.value.name = props.account.name;
});
</script>

<template>
  <CardHeader>
    <div class="flex flex-wrap justify-between items-start">
      <p class="flex gap-2 items-center">
        <span class="text-xl">
          {{ account.name }}
        </span>

        <div class="flex gap-1 items-center">
          <PortfolioTransferDialog :account="account" context="account">
            <Button variant="ghost" size="icon" title="Transfer to Portfolio">
              <ArrowRightLeftIcon :size="20" />
            </Button>
          </PortfolioTransferDialog>

          <Popover.Popover :open="formEditingPopoverOpen" @update:open="formEditingPopoverOpen = $event">
            <Popover.PopoverTrigger>
              <Button variant="ghost" size="icon" title="Edit Account Name">
                <Edit2Icon :size="20" />
              </Button>
            </Popover.PopoverTrigger>
            <Popover.PopoverContent>
              <form class="grid gap-6" @submit.prevent="updateAccount">
                <InputField
                  v-model="accountNameForm.name"
                  label="Account name"
                  placeholder="Account name"
                  :error-message="getFieldErrorMessage('form.name')"
                />

                <Button type="submit" :disabled="accountNameForm.name === account.name"> Save </Button>
              </form>
            </Popover.PopoverContent>
          </Popover.Popover>
        </div>
      </p>
      <div class="flex flex-wrap gap-2 justify-start items-end ml-auto">
        <span v-if="account.currencyCode !== baseCurrency.currencyCode" class="text-white text-opacity-50">
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
