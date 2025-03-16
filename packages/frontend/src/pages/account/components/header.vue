<script setup lang="ts">
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
import { Edit2Icon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';

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
</script>

<template>
  <CardHeader>
    <div class="flex flex-wrap items-start justify-between">
      <p class="flex items-center gap-2">
        <span class="text-xl">
          {{ account.name }}
        </span>

        <Popover.Popover :open="formEditingPopoverOpen" @update:open="formEditingPopoverOpen = $event">
          <Popover.PopoverTrigger>
            <Button variant="ghost" size="icon">
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
      </p>
      <div class="flex flex-wrap items-end justify-start gap-2 ml-auto">
        <span v-if="account.currencyId !== baseCurrency.currencyId" class="text-white text-opacity-50">
          ~
          {{ toLocalNumber(account.refCurrentBalance) }}
          {{ baseCurrency.currency.code }}
        </span>
        <span class="text-3xl">
          {{ toLocalNumber(account.currentBalance) }}
          {{ currenciesMap[account.currencyId].currency.code }}
        </span>
      </div>
    </div>
  </CardHeader>
</template>
