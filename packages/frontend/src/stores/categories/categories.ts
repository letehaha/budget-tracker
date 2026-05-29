import { loadSystemCategories } from '@/api';
import { type FormattedCategory } from '@/common/types';
import { useNotificationCenter } from '@/components/notification-center';
import { i18n } from '@/i18n';
import * as errors from '@/js/errors';
import { useUserStore } from '@/stores/user';
import { CategoryModel } from '@bt/shared/types';
import { defineStore, storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

import { buildCategoriesObjectGraph } from './helpers';

export const useCategoriesStore = defineStore('categories', () => {
  const notificationStore = useNotificationCenter();
  const { user: currentUser } = storeToRefs(useUserStore());

  // Holds the union of the caller's own categories plus categories of every account-
  // owner the caller has read access to. Display lookups (transaction lists, widgets,
  // CategoryCircle's icon walk) resolve through `categoriesMap`, which keys this whole
  // set by id. The picker default narrows to the caller's own set via
  // `formattedCategories` so a recipient creating a tx on their own account doesn't see
  // someone else's tree.
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

  const ownCategories = computed<CategoryModel[]>(() => {
    const callerUserId = currentUser.value?.id;
    if (callerUserId == null) return categories.value;
    return categories.value.filter((c) => c.userId === callerUserId);
  });

  const formattedCategories = computed<FormattedCategory[]>(() => buildCategoriesObjectGraph(ownCategories.value));
  const categoriesMap = computed(() =>
    categories.value.reduce(
      (acc, curr) => {
        acc[curr.id] = curr;
        return acc;
      },
      {} as Record<string, CategoryModel>,
    ),
  );

  return {
    categories,
    categoriesMap,
    formattedCategories,
    loadCategories,
  };
});
