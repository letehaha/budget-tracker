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
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{
  added: [value: string];
}>();

const { t } = useI18n();
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
    addSuccessNotification(t('dialogs.addCurrency.notifications.success'));
    formStatus.value = 'default';
    isOpen.value = false;

    emit('added', currencyCode);
  } catch {
    addErrorNotification(t('dialogs.addCurrency.notifications.error'));
    formStatus.value = 'error';
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title> {{ $t('dialogs.addCurrency.title') }} </template>

    <template #description> {{ $t('dialogs.addCurrency.description') }} </template>

    <form class="mt-4 grid gap-6" @submit.prevent="saveCurrency">
      <Select.Select v-model="form.currencyCode" autocomplete="false">
        <Select.SelectTrigger>
          <Select.SelectValue :placeholder="$t('dialogs.addCurrency.selectPlaceholder')" />
        </Select.SelectTrigger>
        <Select.SelectContent>
          <template v-for="item of systemCurrenciesVerbose.unlinked" :key="item.code">
            <Select.SelectItem :value="String(item.code)"> {{ item.code }} – {{ item.currency }} </Select.SelectItem>
          </template>
        </Select.SelectContent>
      </Select.Select>

      <Button type="submit"> {{ $t('dialogs.addCurrency.addButton') }} </Button>
    </form>
  </ResponsiveDialog>
</template>
