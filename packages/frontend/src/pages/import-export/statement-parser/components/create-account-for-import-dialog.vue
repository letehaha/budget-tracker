<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>Create Account for Import</template>
    <template #description> Create a new account to import your statement transactions. </template>

    <form class="grid gap-6" @submit.prevent="handleSubmit">
      <InputField
        v-model="form.name"
        label="Account name"
        :placeholder="$t('pages.statementParser.accountNamePlaceholder')"
        :error="errors.name"
      />

      <!--
        Currency field is disabled when defaultCurrency is provided from statement.
        It makes no sense to allow changing currency if the statement has a specific currency -
        the account must match the statement currency for proper transaction import.
      -->
      <div>
        <FieldLabel label="Currency">
          <Select.Select v-model="form.currencyCode" :disabled="!!props.defaultCurrency">
            <Select.SelectTrigger>
              <Select.SelectValue :placeholder="$t('pages.statementParser.selectCurrency')" />
            </Select.SelectTrigger>
            <Select.SelectContent>
              <!-- Show statement currency first if it exists and is not in linked list -->
              <template v-if="props.defaultCurrency && !isCurrencyLinked">
                <Select.SelectItem :value="props.defaultCurrency">
                  {{ props.defaultCurrency }} (from statement)
                </Select.SelectItem>
                <div class="my-1 border-t" />
              </template>
              <template v-for="item of systemCurrenciesVerbose.linked" :key="item.code">
                <Select.SelectItem :value="String(item.code)">
                  {{ formatCurrencyLabel({ code: item.code, fallbackName: item.currency }) }}
                </Select.SelectItem>
              </template>
            </Select.SelectContent>
          </Select.Select>
        </FieldLabel>
        <p v-if="props.defaultCurrency" class="text-muted-foreground mt-1 text-xs">
          Currency is locked to match the statement ({{ props.defaultCurrency }}).
        </p>
        <p v-if="props.defaultCurrency && !isCurrencyLinked" class="mt-1 text-xs text-yellow-600">
          Note: {{ props.defaultCurrency }} will be added to your currencies.
        </p>
      </div>

      <div class="flex gap-3">
        <Button type="button" variant="outline" class="flex-1" @click="isOpen = false"> Cancel </Button>
        <Button type="submit" class="flex-1" :disabled="isLoading || !form.currencyCode">
          {{ isLoading ? 'Creating...' : 'Create Account' }}
        </Button>
      </div>
    </form>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { createAccount as apiCreateAccount } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import FieldLabel from '@/components/fields/components/field-label.vue';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import * as Select from '@/components/lib/ui/select';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useCurrencyName } from '@/composable';
import { useCurrenciesStore } from '@/stores';
import { ACCOUNT_CATEGORIES, type AccountModel } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';

const props = defineProps<{
  open?: boolean;
  defaultCurrency?: string;
  defaultName?: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  created: [account: AccountModel];
}>();

const queryClient = useQueryClient();
const currenciesStore = useCurrenciesStore();
const { addNotification } = useNotificationCenter();
const { formatCurrencyLabel } = useCurrencyName();

const { baseCurrency, systemCurrenciesVerbose } = storeToRefs(currenciesStore);

const isOpen = computed({
  get: () => props.open ?? false,
  set: (value) => emit('update:open', value),
});

/**
 * Get the currency to use for the new account.
 * Priority:
 * 1. props.defaultCurrency (from statement metadata) if it's in the user's linked currencies
 * 2. props.defaultCurrency even if not linked (user might want to add it)
 * 3. User's base currency as fallback
 */
const getInitialCurrency = () => {
  if (props.defaultCurrency) {
    return props.defaultCurrency;
  }
  return baseCurrency.value?.currencyCode || '';
};

const form = reactive({
  name: '',
  currencyCode: getInitialCurrency(),
});

const errors = reactive({
  name: '',
});

const isLoading = ref(false);

// Check if the selected currency is in the linked list
const isCurrencyLinked = computed(() => {
  return systemCurrenciesVerbose.value.linked.some((c) => c.code === form.currencyCode);
});

// Reset form when dialog opens - use the prop values directly
watch(
  () => props.open,
  (open) => {
    if (open) {
      // Prefill with bank name if available from statement
      form.name = props.defaultName || '';
      // Always use the prop value when dialog opens
      form.currencyCode = props.defaultCurrency || baseCurrency.value?.currencyCode || '';
      errors.name = '';
    }
  },
);

// Also watch for changes to defaultCurrency prop while dialog is open
watch(
  () => props.defaultCurrency,
  (newCurrency) => {
    if (newCurrency && isOpen.value) {
      form.currencyCode = newCurrency;
    }
  },
);

async function handleSubmit() {
  // Validate
  errors.name = '';

  if (!form.name.trim()) {
    errors.name = 'Account name is required';
    return;
  }

  if (!form.currencyCode) {
    addNotification({
      text: 'Please select a currency',
      type: NotificationType.error,
    });
    return;
  }

  isLoading.value = true;

  try {
    const account = await apiCreateAccount({
      name: form.name.trim(),
      currencyCode: form.currencyCode,
      accountCategory: ACCOUNT_CATEGORIES.general,
      initialBalance: 0,
      creditLimit: 0,
    });

    await queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.allAccounts,
    });

    addNotification({
      text: 'Account created successfully',
      type: NotificationType.success,
    });

    emit('created', account);
    isOpen.value = false;
  } catch (error) {
    addNotification({
      text: error instanceof Error ? error.message : 'Failed to create account',
      type: NotificationType.error,
    });
  } finally {
    isLoading.value = false;
  }
}
</script>
