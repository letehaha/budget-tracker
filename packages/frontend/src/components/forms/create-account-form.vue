<script setup lang="ts">
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { ACCOUNT_CATEGORIES_TRANSLATION_KEYS } from '@/common/const/account-categories-verbose';
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
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

const AddCurrencyDialog = defineAsyncComponent(() => import('@/components/dialogs/add-currency-dialog.vue'));

const emit = defineEmits(['created']);

const { t } = useI18n();
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
      text: t('forms.createAccount.notifications.success'),
      type: NotificationType.success,
    });

    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.allAccounts,
    });

    emit('created');
  } catch {
    addNotification({
      text: t('forms.createAccount.notifications.error'),
      type: NotificationType.error,
    });
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <form class="grid gap-6" @submit.prevent="submit">
    <input-field
      v-model="form.name"
      :label="$t('forms.createAccount.nameLabel')"
      :placeholder="$t('forms.createAccount.namePlaceholder')"
    />

    <div>
      <FieldLabel :label="$t('forms.createAccount.currencyLabel')">
        <Select.Select v-model="form.currencyCode">
          <Select.SelectTrigger>
            <Select.SelectValue :placeholder="$t('forms.createAccount.currencyPlaceholder')" />
          </Select.SelectTrigger>
          <Select.SelectContent>
            <template v-for="item of systemCurrenciesVerbose.linked" :key="item.code">
              <Select.SelectItem :value="String(item.code)"> {{ item.code }} - {{ item.currency }} </Select.SelectItem>
            </template>

            <AddCurrencyDialog @added="form.currencyCode = String($event)">
              <ui-button type="button" class="mt-4 w-full" variant="link">
                {{ $t('forms.createAccount.addCurrencyButton') }}
              </ui-button>
            </AddCurrencyDialog>
          </Select.SelectContent>
        </Select.Select>
      </FieldLabel>
    </div>

    <input-field
      v-model="form.initialBalance"
      :label="$t('forms.createAccount.initialBalanceLabel')"
      :placeholder="$t('forms.createAccount.initialBalancePlaceholder')"
    />

    <FieldLabel :label="$t('forms.createAccount.accountCategoryLabel')">
      <Select.Select v-model="form.accountCategory">
        <Select.SelectTrigger>
          <Select.SelectValue :placeholder="$t('forms.createAccount.accountCategoryPlaceholder')" />
        </Select.SelectTrigger>
        <Select.SelectContent>
          <template v-for="[category, labelKey] in Object.entries(ACCOUNT_CATEGORIES_TRANSLATION_KEYS)" :key="category">
            <Select.SelectItem :value="category">
              {{ t(labelKey) }}
            </Select.SelectItem>
          </template>
        </Select.SelectContent>
      </Select.Select>
    </FieldLabel>

    <input-field
      v-model="form.creditLimit"
      :label="$t('forms.createAccount.creditLimitLabel')"
      :placeholder="$t('forms.createAccount.creditLimitPlaceholder')"
    />

    <div class="flex">
      <ui-button type="submit" class="ml-auto min-w-30" :disabled="isLoading">
        {{ isLoading ? $t('forms.createAccount.submitButtonLoading') : $t('forms.createAccount.submitButton') }}
      </ui-button>
    </div>
  </form>
</template>
