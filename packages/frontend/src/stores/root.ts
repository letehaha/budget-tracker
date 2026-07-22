import { useBaseCurrencyChangeStatus } from '@/composable/use-base-currency-change-status';
import { useAuthStore } from '@/stores/auth';
import { useCategoriesStore } from '@/stores/categories/categories';
import { useCurrenciesStore } from '@/stores/currencies';
import { useUserStore } from '@/stores/user';
import { defineStore, storeToRefs } from 'pinia';
import { ref } from 'vue';

export const useRootStore = defineStore('root', () => {
  const authStore = useAuthStore();
  const currenciesStore = useCurrenciesStore();
  const userStore = useUserStore();
  const categoriesStore = useCategoriesStore();

  const isAppInitialized = ref(false);

  const { isLoggedIn } = storeToRefs(authStore);
  const { user } = storeToRefs(userStore);
  const { categories } = storeToRefs(categoriesStore);
  const { isBaseCurrencyExists } = storeToRefs(currenciesStore);

  const fetchInitialData = async () => {
    if (isLoggedIn.value) {
      isAppInitialized.value = false;

      if (!user.value) {
        await userStore.loadUser();
      }

      await Promise.all([
        ...(categories.value.length ? [] : [categoriesStore.loadCategories()]),
        currenciesStore.loadCurrencies(),
        ...(isBaseCurrencyExists.value ? [] : [currenciesStore.loadBaseCurrency()]),
        // Attaches the blocking overlay if a base-currency change is already in flight.
        useBaseCurrencyChangeStatus().checkOnBoot(),
      ]);

      isAppInitialized.value = true;
    }
  };

  return {
    fetchInitialData,

    isAppInitialized,
  };
});
