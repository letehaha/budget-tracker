<template>
  <div class="max-w-[500px]">
    <Card class="px-2 py-4">
      <div class="relative mb-4 flex items-center justify-between px-4 py-2">
        <h3 class="text-lg font-semibold">Categories</h3>

        <Button variant="outline" size="sm" class="gap-1.5" @click="openEditDialog()">
          <PlusIcon class="size-4" />
          Add Category
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
          />
        </template>
        <template v-else>
          <div class="text-muted-foreground py-8 text-center">
            No categories yet. Create your first category to get started.
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
      @deleted="handleCategoryDeleted"
    />

    <AlertDialog v-model:open="deleteDialogState.isOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete category?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete "{{ deleteDialogState.category?.name }}". This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="handleDeleteCategory"> Delete </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { deleteCategory as apiDeleteCategory } from '@/api';
import { type FormattedCategory } from '@/common/types';
import Accordion from '@/components/common/accordion.vue';
import CategoryFormDialog from '@/components/dialogs/category-form-dialog.vue';
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
import { useCategoriesStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { PlusIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { reactive, ref } from 'vue';

defineOptions({
  name: 'settings-categories',
});

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

const handleCategoryDeleted = () => {
  dialogState.isOpen = false;
  selectedCategoryId.value = null;
};

const openDeleteConfirmation = (category: FormattedCategory) => {
  deleteDialogState.category = category;
  deleteDialogState.isOpen = true;
};

const handleDeleteCategory = async () => {
  if (!deleteDialogState.category) return;

  try {
    await apiDeleteCategory({ categoryId: deleteDialogState.category.id });
    await categoriesStore.loadCategories();
    addSuccessNotification('Category deleted');

    if (selectedCategoryId.value === deleteDialogState.category.id) {
      selectedCategoryId.value = null;
    }
  } catch (err) {
    if (err instanceof ApiErrorResponseError) {
      if (err.data.code === API_ERROR_CODES.validationError) {
        addErrorNotification(err.data.message);
        return;
      }
    }
    addErrorNotification('Failed to delete category');
  } finally {
    deleteDialogState.isOpen = false;
    deleteDialogState.category = undefined;
  }
};

</script>
