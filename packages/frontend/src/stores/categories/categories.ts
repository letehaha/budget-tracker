import { loadSystemCategories } from '@/api';
import { type FormattedCategory } from '@/common/types';
import { useNotificationCenter } from '@/components/notification-center';
import { i18n } from '@/i18n';
import * as errors from '@/js/errors';
import { CategoryModel } from '@bt/shared/types';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { buildCategiesObjectGraph } from './helpers';

export const useCategoriesStore = defineStore('categories', () => {
  const notificationStore = useNotificationCenter();

  const categories = ref<CategoryModel[]>([]);

  const loadCategories = async () => {
    try {
      const result = await loadSystemCategories();

      if (result?.length) categories.value = result;
    } catch (err) {
      if (!(err instanceof errors.AuthError)) {
        notificationStore.addErrorNotification(i18n.global.t('settings.categories.errors.cannotLoad'));
      }
    }
  };

  const formattedCategories = computed<FormattedCategory[]>(() => buildCategiesObjectGraph(categories.value));
  const categoriesMap = computed(() =>
    categories.value.reduce(
      (acc, curr) => {
        acc[curr.id] = curr;
        return acc;
      },
      {} as Record<number, CategoryModel>,
    ),
  );

  return {
    categories,
    categoriesMap,
    formattedCategories,
    loadCategories,
  };
});
