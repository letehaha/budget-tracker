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
  added: [value: number];
}>();

const queryClient = useQueryClient();
const currenciesStore = useCurrenciesStore();
const { systemCurrenciesVerbose } = storeToRefs(currenciesStore);
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const formStatus = ref<'default' | 'loading' | 'error'>('default');
const isOpen = ref(false);

const form = ref<{
  currencyId: string;
}>({
  currencyId: String(systemCurrenciesVerbose.value.unlinked[0].id),
});

const saveCurrency = async () => {
  try {
    formStatus.value = 'loading';

    const currencyId = Number(form.value.currencyId);
    await addUserCurrencies([{ currencyId }]);

    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.exchangeRates,
    });
    await currenciesStore.loadCurrencies();
    addSuccessNotification('Currency successfully added!');
    formStatus.value = 'default';
    isOpen.value = false;

    emit('added', currencyId);
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

    <form class="grid gap-6 mt-4" @submit.prevent="saveCurrency">
      <Select.Select v-model="form.currencyId" autocomplete="false">
        <Select.SelectTrigger>
          <Select.SelectValue placeholder="Select currency" />
        </Select.SelectTrigger>
        <Select.SelectContent>
          <template v-for="item of systemCurrenciesVerbose.unlinked" :key="item.id">
            <Select.SelectItem :value="String(item.id)"> {{ item.code }} – {{ item.currency }} </Select.SelectItem>
          </template>
        </Select.SelectContent>
      </Select.Select>

      <Button type="submit"> Add </Button>
    </form>
  </ResponsiveDialog>
</template>
