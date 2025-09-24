<script setup lang="ts">
import { addUserCurrencies } from '@/api/currencies';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import * as Select from '@/components/lib/ui/select';
import { useNotificationCenter } from '@/components/notification-center';
import { useCurrenciesStore } from '@/stores';
import { useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';

const emit = defineEmits<{
  added: [value: string];
}>();

const queryClient = useQueryClient();
const currenciesStore = useCurrenciesStore();
const { systemCurrenciesVerbose } = storeToRefs(currenciesStore);
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const formStatus = ref<'default' | 'loading' | 'error'>('default');
const isOpen = ref(false);

const form = ref<{
  currencyCode: string;
}>({
  currencyCode: String(systemCurrenciesVerbose.value.unlinked[0].code),
});

const saveCurrency = async () => {
  try {
    formStatus.value = 'loading';

    const currencyCode = form.value.currencyCode;
    await addUserCurrencies([{ currencyCode }]);

    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.exchangeRates,
    });
    await currenciesStore.loadCurrencies();
    addSuccessNotification('Currency successfully added!');
    formStatus.value = 'default';
    isOpen.value = false;

    emit('added', currencyCode);
  } catch {
    addErrorNotification('Unexpected error. Currency is not added.');
    formStatus.value = 'error';
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title> Add new currency </template>

    <template #description> Select one currency to add </template>

    <form class="mt-4 grid gap-6" @submit.prevent="saveCurrency">
      <Select.Select v-model="form.currencyCode" autocomplete="false">
        <Select.SelectTrigger>
          <Select.SelectValue placeholder="Select currency" />
        </Select.SelectTrigger>
        <Select.SelectContent>
          <template v-for="item of systemCurrenciesVerbose.unlinked" :key="item.id">
            <Select.SelectItem :value="String(item.code)"> {{ item.code }} – {{ item.currency }} </Select.SelectItem>
          </template>
        </Select.SelectContent>
      </Select.Select>

      <Button type="submit"> Add </Button>
    </form>
  </ResponsiveDialog>
</template>
