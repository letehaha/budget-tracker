<script setup lang="ts">
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { ACCOUNT_CATEGORIES_VERBOSE } from '@/common/const/account-categories-verbose';
import FieldLabel from '@/components/fields/components/field-label.vue';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Select from '@/components/lib/ui/select';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, defineAsyncComponent, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';

const AddCurrencyDialog = defineAsyncComponent(() => import('@/components/dialogs/add-currency-dialog.vue'));

const emit = defineEmits(['created']);

const route = useRoute();
const queryClient = useQueryClient();
const accountsStore = useAccountsStore();
const currenciesStore = useCurrenciesStore();
const { addNotification } = useNotificationCenter();

const { baseCurrency, systemCurrenciesVerbose } = storeToRefs(currenciesStore);

const defaultCurrency = computed(
  () => systemCurrenciesVerbose.value.linked.find((i) => i.code === baseCurrency.value.currencyCode).code || '',
);

// Get account category from query params or default to general
const defaultAccountCategory = (route.query.category as ACCOUNT_CATEGORIES) || ACCOUNT_CATEGORIES.general;

const form = reactive<{
  name: string;
  currencyCode: string;
  accountCategory: ACCOUNT_CATEGORIES;
  initialBalance: number;
  creditLimit: number;
}>({
  name: '',
  currencyCode: String(defaultCurrency.value),
  accountCategory: defaultAccountCategory,
  initialBalance: 0,
  creditLimit: 0,
});

const isLoading = ref(false);

const submit = async () => {
  try {
    isLoading.value = true;

    await accountsStore.createAccount({
      currencyCode: form.currencyCode,
      name: form.name,
      accountCategory: form.accountCategory,
      creditLimit: form.creditLimit,
      initialBalance: form.initialBalance,
    });

    addNotification({
      text: 'Created successfully.',
      type: NotificationType.success,
    });

    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.allAccounts,
    });

    emit('created');
  } catch {
    addNotification({
      text: 'Unexpected error.',
      type: NotificationType.error,
    });
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <form class="grid gap-6" @submit.prevent="submit">
    <input-field v-model="form.name" label="Account name" placeholder="Account name" />

    <div>
      <FieldLabel label="Currency">
        <Select.Select v-model="form.currencyCode">
          <Select.SelectTrigger>
            <Select.SelectValue placeholder="Select currency" />
          </Select.SelectTrigger>
          <Select.SelectContent>
            <template v-for="item of systemCurrenciesVerbose.linked" :key="item.id">
              <Select.SelectItem :value="String(item.code)"> {{ item.code }} - {{ item.currency }} </Select.SelectItem>
            </template>

            <AddCurrencyDialog @added="form.currencyCode = String($event)">
              <ui-button type="button" class="mt-4 w-full" variant="link"> Add new currency + </ui-button>
            </AddCurrencyDialog>
          </Select.SelectContent>
        </Select.Select>
      </FieldLabel>
    </div>

    <input-field v-model="form.initialBalance" label="Initial balance" placeholder="Initial balance" />

    <FieldLabel label="Account Category">
      <Select.Select v-model="form.accountCategory">
        <Select.SelectTrigger>
          <Select.SelectValue placeholder="Select account category" />
        </Select.SelectTrigger>
        <Select.SelectContent>
          <template v-for="[category, label] in Object.entries(ACCOUNT_CATEGORIES_VERBOSE)" :key="category">
            <Select.SelectItem :value="category">
              {{ label }}
            </Select.SelectItem>
          </template>
        </Select.SelectContent>
      </Select.Select>
    </FieldLabel>

    <input-field v-model="form.creditLimit" label="Credit limit" placeholder="Credit limit" />

    <div class="flex">
      <ui-button type="submit" class="ml-auto min-w-[120px]" :disabled="isLoading">
        {{ isLoading ? 'Creating...' : 'Create' }}
      </ui-button>
    </div>
  </form>
</template>
