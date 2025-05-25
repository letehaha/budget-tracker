<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(2,minmax(0,450px))]">
    <Card class="max-w-[450px] px-2 py-4">
      <div class="relative mb-4 flex justify-center px-4 py-2">
        <h3 class="text-lg font-semibold">All Categories</h3>
      </div>

      <div class="mt-4 grid gap-2 px-4 text-center">
        <template v-if="formattedCategories.length">
          <Accordion
            :categories="formattedCategories"
            :expanded-categories="expandedCategories"
            :max-level="MAX_CATEGORIES_NESTING"
            :current-level="1"
            :active-category-id="selectedCategory?.id"
            @toggle="toggleCategory"
            @select="selectCategory"
          />
        </template>
        <template v-else>
          <div>No subcategories</div>
        </template>
      </div>
    </Card>

    <Card as="form" class="max-h-[300px] max-w-[450px] px-2 py-4" @submit.prevent="applyChanges">
      <div class="relative mb-4 flex justify-center px-4 py-2">
        <h3 class="text-lg font-semibold">Edit Category</h3>
        <Button type="submit" class="absolute right-2 top-0">Save</Button>
      </div>
      <div class="mt-12 px-4">
        <InputField v-model="form.name" label="Category name" placeholder="Category name" />
      </div>
      <label class="mt-4 flex cursor-pointer items-center gap-4 px-4">
        <p>Exclude category from expenses stats</p>
        <Checkbox v-model:checked="form.excludeFromStats" />
      </label>
      <div class="mt-5 flex justify-between px-4">
        <Button variant="destructive" @click.prevent="deleteCategory"> Delete category </Button>

        <div v-if="isAddSubcategoryVisible" class="text-center">
          <Button type="button" class="w-full" variant="secondary" @click="startCreating"> Add subcategory + </Button>
        </div>
      </div>
    </Card>
    <ResponsiveDialog v-model:open="isDialogVisible">
      <template #trigger>
        <slot />
      </template>

      <template #title> Add new category </template>

      <form class="mt-4 grid gap-6" @submit.prevent="applyChanges">
        <InputField v-model="newCategoryName" label="Category name" placeholder="Category name" />

        <Button type="submit" class="w-full" variant="secondary"> Add category </Button>
      </form>
    </ResponsiveDialog>
  </div>
</template>

<script setup lang="ts">
import { deleteCategory as apiDeleteCategory, createCategory, editCategory } from '@/api';
import { type FormattedCategory } from '@/common/types';
import { removeNullishValues } from '@/common/utils/remove-keys';
import Accordion from '@/components/common/accordion.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { addCategories, removeCategories, useUserSettings } from '@/composable/data-queries/user-settings';
import { ApiErrorResponseError } from '@/js/errors';
import { useCategoriesStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

defineOptions({
  name: 'settings-categories',
});

const router = useRouter();
const route = useRoute();
const categoriesStore = useCategoriesStore();

const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
const { formattedCategories } = storeToRefs(categoriesStore);
const selectedCategory = ref<FormattedCategory | null>(null);
const isAddSubcategoryVisible = ref(true);

const { data: userSettings, mutateAsync: updateUserSettings } = useUserSettings();

const form = reactive({
  name: '',
  excludeFromStats: false,
});
// const isFormVisible = ref(false);
const isEditing = ref(true);
const isCreating = ref(false);
const isDialogVisible = ref(false);
const MAX_CATEGORIES_NESTING = 3;
const expandedCategories = ref<number[]>([]);
const newCategoryName = ref('');
const startCreating = () => {
  newCategoryName.value = '';
  isEditing.value = false;
  isCreating.value = true;
  isDialogVisible.value = true;
};
const findCategoryById = (categories, id) => {
  for (const category of categories) {
    if (category.id === id) {
      return category;
    }
    if (category.subCategories && category.subCategories.length > 0) {
      const result = findCategoryById(category.subCategories, id);
      if (result) {
        return result;
      }
    }
  }
  return null;
};
const getCategoryParents = (categories, id, parents = []) => {
  for (const category of categories) {
    if (category.id === id) {
      return [...parents, category];
    }
    if (category.subCategories && category.subCategories.length > 0) {
      const result = getCategoryParents(category.subCategories, id, [...parents, category]);
      if (result) {
        return result;
      }
    }
  }
  return [];
};
const getCategoryLevel = (category, allCategories, level = 1) => {
  if (!category.parentId) {
    return level;
  }

  const parentCategory = findCategoryById(allCategories, category.parentId);
  if (!parentCategory) {
    return level;
  }

  return getCategoryLevel(parentCategory, allCategories, level + 1);
};
const toggleCategory = (category) => {
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

  const currentLevel = getCategoryLevel(category, formattedCategories.value);

  if (currentLevel < MAX_CATEGORIES_NESTING || currentLevel === MAX_CATEGORIES_NESTING - 1) {
    isAddSubcategoryVisible.value = true;
  } else {
    isAddSubcategoryVisible.value = false;
  }

  router.replace({
    query: {
      ...route.query,
      selectedCategory: categoryId,
    },
  });

  selectedCategory.value = category;
  form.name = category.name;

  if (userSettings.value?.stats?.expenses?.excludedCategories) {
    form.excludeFromStats = userSettings.value.stats.expenses.excludedCategories.includes(selectedCategory.value.id);
  } else {
    form.excludeFromStats = false;
  }
};

const applyChanges = async () => {
  if (!selectedCategory.value) return;

  try {
    if (isEditing.value) {
      await editCategory({
        categoryId: selectedCategory.value.id,
        name: form.name,
      });
    } else if (isCreating.value) {
      type InputParams = Parameters<typeof createCategory>[0];

      let params: InputParams = { name: newCategoryName.value };

      if (selectedCategory.value) {
        params = removeNullishValues({
          ...params,
          imageUrl: selectedCategory.value.imageUrl,
          color: selectedCategory.value.color,
          parentId: selectedCategory.value.id,
        }) as InputParams;
      }
      await createCategory(params);
      isDialogVisible.value = false;
    }

    await updateUserSettings(
      form.excludeFromStats
        ? addCategories(userSettings.value, [selectedCategory.value.id])
        : removeCategories(userSettings.value, [selectedCategory.value.id]),
    );
    addSuccessNotification('Successfully updated!');
    await categoriesStore.loadCategories();
  } catch {
    addErrorNotification('Unexpected error!');
  }
};
const selectCategory = (category) => {
  selectedCategory.value = category;
};
const deleteCategory = async () => {
  try {
    await apiDeleteCategory({ categoryId: selectedCategory.value.id });

    await categoriesStore.loadCategories();
    addSuccessNotification('Successfully deleted!');
    form.name = '';
  } catch (err) {
    if (err instanceof ApiErrorResponseError) {
      if (err.data.code === API_ERROR_CODES.validationError) {
        addErrorNotification(err.data.message);
        return;
      }
    }
    addErrorNotification('Unexpected error. Category is not deleted.');
  }
};

onMounted(() => {
  const selectedCategoryId = route.query.selectedCategory;

  if (selectedCategoryId) {
    const categoryParents = getCategoryParents(formattedCategories.value, Number(selectedCategoryId));

    if (categoryParents.length > 0) {
      const category = categoryParents[categoryParents.length - 1];
      const allCategoryIds = categoryParents.map((c) => c.id);
      expandedCategories.value = allCategoryIds;

      toggleCategory(category);
    } else {
      console.warn(`Category with ID ${selectedCategoryId} not found`);
    }
  }
});
</script>
