<template>
  <div class="max-w-125">
    <Card class="px-2 py-4">
      <div class="relative mb-4 flex items-center justify-between px-4 py-2">
        <h3 class="text-lg font-semibold">{{ $t('settings.categories.title') }}</h3>

        <Button variant="outline" size="sm" class="gap-1.5" @click="openEditDialog()">
          <PlusIcon class="size-4" />
          {{ $t('settings.categories.addButton') }}
        </Button>
      </div>

      <div class="mt-4 grid gap-2 px-4">
        <template v-if="formattedCategories.length">
          <Accordion
            :categories="formattedCategories"
            :expanded-categories="expandedCategories"
            :max-level="MAX_CATEGORIES_NESTING"
            :current-level="1"
            :active-category-id="selectedCategoryId"
            show-actions
            @toggle="toggleCategory"
            @select="selectCategory"
            @edit="openEditDialog"
            @add-subcategory="openAddSubcategoryDialog"
            @delete="openDeleteConfirmation"
            @view-transactions="viewCategoryTransactions"
            @view-analytics="viewCategoryAnalytics"
          />
        </template>
        <template v-else>
          <div class="text-muted-foreground py-8 text-center">
            {{ $t('settings.categories.empty') }}
          </div>
        </template>
      </div>
    </Card>

    <CategoryFormDialog
      v-model:open="dialogState.isOpen"
      :key="dialogState.key"
      :category="dialogState.category"
      :parent-category="dialogState.parentCategory"
      @saved="handleCategorySaved"
    />

    <AlertDialog v-model:open="deleteDialogState.isOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ $t('settings.categories.delete.title') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('settings.categories.delete.description', { name: deleteDialogState.category?.name }) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ $t('settings.categories.delete.cancelButton') }}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="handleDeleteCategory">
            {{ $t('settings.categories.delete.deleteButton') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <ReassignCategoryDialog
      v-model:open="reassignDialogState.isOpen"
      :category="reassignDialogState.category!"
      :transaction-count="reassignDialogState.transactionCount"
      @deleted="handleReassignDeleted"
    />
  </div>
</template>

<script setup lang="ts">
import { deleteCategory as apiDeleteCategory, getCategoryTransactionCount } from '@/api';
import { type FormattedCategory } from '@/common/types';
import Accordion from '@/components/common/accordion.vue';
import CategoryFormDialog from '@/components/dialogs/category-form-dialog.vue';
import ReassignCategoryDialog from '@/components/dialogs/reassign-category-dialog.vue';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/lib/ui/alert-dialog';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import { useCategoriesStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { PlusIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

defineOptions({
  name: 'settings-categories',
});

const { t } = useI18n();
const router = useRouter();
const categoriesStore = useCategoriesStore();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const { formattedCategories } = storeToRefs(categoriesStore);

const MAX_CATEGORIES_NESTING = 3;
const expandedCategories = ref<number[]>([]);
const selectedCategoryId = ref<number | null>(null);

const dialogState = reactive<{
  isOpen: boolean;
  key: number;
  category?: FormattedCategory;
  parentCategory?: FormattedCategory;
}>({
  isOpen: false,
  key: 0,
  category: undefined,
  parentCategory: undefined,
});

const deleteDialogState = reactive<{
  isOpen: boolean;
  category?: FormattedCategory;
}>({
  isOpen: false,
  category: undefined,
});

const reassignDialogState = reactive<{
  isOpen: boolean;
  category?: FormattedCategory;
  transactionCount: number;
}>({
  isOpen: false,
  category: undefined,
  transactionCount: 0,
});

const toggleCategory = (category: FormattedCategory) => {
  const categoryId = category.id;
  const index = expandedCategories.value.indexOf(categoryId);

  if (category.parentId === null && !expandedCategories.value.includes(category.id)) {
    expandedCategories.value = [];
  }

  if (index === -1) {
    expandedCategories.value.push(categoryId);
  } else {
    expandedCategories.value.splice(index, 1);
  }

  selectedCategoryId.value = categoryId;
};

const selectCategory = (category: FormattedCategory) => {
  selectedCategoryId.value = category.id;
};

const viewCategoryTransactions = (category: FormattedCategory) => {
  router.push({
    name: ROUTES_NAMES.transactions,
    query: { categoryIds: String(category.id) },
  });
};

const viewCategoryAnalytics = (category: FormattedCategory) => {
  router.push({
    name: ROUTES_NAMES.analyticsTrendsComparison,
    query: { categoryIds: String(category.id) },
  });
};

const openEditDialog = (category?: FormattedCategory) => {
  dialogState.category = category;
  dialogState.parentCategory = undefined;
  dialogState.key++;
  dialogState.isOpen = true;
};

const openAddSubcategoryDialog = (parentCategory: FormattedCategory) => {
  dialogState.category = undefined;
  dialogState.parentCategory = parentCategory;
  dialogState.key++;
  dialogState.isOpen = true;
};

const handleCategorySaved = () => {
  dialogState.isOpen = false;
};

const openDeleteConfirmation = async (category: FormattedCategory) => {
  try {
    const { transactionCount } = await getCategoryTransactionCount({ categoryId: category.id });

    if (transactionCount > 0) {
      reassignDialogState.category = category;
      reassignDialogState.transactionCount = transactionCount;
      reassignDialogState.isOpen = true;
    } else {
      deleteDialogState.category = category;
      deleteDialogState.isOpen = true;
    }
  } catch {
    addErrorNotification(t('settings.categories.notifications.checkFailed'));
  }
};

const handleDeleteCategory = async () => {
  if (!deleteDialogState.category) return;

  try {
    await apiDeleteCategory({ categoryId: deleteDialogState.category.id });
    await categoriesStore.loadCategories();
    addSuccessNotification(t('settings.categories.notifications.deleteSuccess'));

    if (selectedCategoryId.value === deleteDialogState.category.id) {
      selectedCategoryId.value = null;
    }
  } catch (err) {
    if (err instanceof ApiErrorResponseError) {
      if (err.data.code === API_ERROR_CODES.validationError) {
        addErrorNotification(err.data.message ?? '');
        return;
      }
    }
    addErrorNotification(t('settings.categories.notifications.deleteFailed'));
  } finally {
    deleteDialogState.isOpen = false;
    deleteDialogState.category = undefined;
  }
};

const handleReassignDeleted = () => {
  if (reassignDialogState.category && selectedCategoryId.value === reassignDialogState.category.id) {
    selectedCategoryId.value = null;
  }
  reassignDialogState.isOpen = false;
  reassignDialogState.category = undefined;
  reassignDialogState.transactionCount = 0;
};
</script>
