<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>
      {{ isEditMode ? 'Edit Category' : 'Add Category' }}
    </template>

    <template #description>
      <template v-if="parentCategory">
        Adding subcategory to
        <span class="font-medium">{{ parentCategory.name }}</span>
      </template>
      <template v-else-if="isEditMode"> Update category name or settings </template>
      <template v-else> Create a new category </template>
    </template>

    <form class="mt-4 grid gap-4" @submit.prevent="handleSubmit">
      <InputField v-model="form.name" label="Category name" placeholder="Enter category name" autofocus />

      <ColorSelectField v-if="isCreatingTopLevelCategory" v-model="form.color" label="Color" />

      <div class="flex items-center gap-3">
        <div class="bg-border h-px flex-1" />
        <span class="text-muted-foreground text-xs">Settings</span>
        <div class="bg-border h-px flex-1" />
      </div>

      <div class="flex items-center gap-3">
        <label class="flex cursor-pointer items-center gap-3">
          <Checkbox v-model="form.excludeFromStats" />
          <span class="text-sm">Exclude from expense stats</span>
        </label>

        <ResponsiveTooltip
          content="Transactions in this category won't be counted in spending statistics and reports."
          content-class-name="max-w-[250px]"
        >
          <InfoIcon class="text-muted-foreground size-4" />
        </ResponsiveTooltip>
      </div>

      <div class="mt-2 flex items-center" :class="isEditMode ? 'justify-between' : 'justify-end'">
        <AlertDialog v-if="isEditMode">
          <AlertDialogTrigger as-child>
            <Button type="button" variant="destructive" :disabled="isSubmitting"> Delete </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete category?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{{ category?.name }}". This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" @click="handleDelete">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button type="submit" :disabled="isSubmitDisabled">
          {{ isEditMode ? 'Save' : 'Create' }}
        </Button>
      </div>
    </form>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { deleteCategory as apiDeleteCategory, createCategory, editCategory } from '@/api';
import { type FormattedCategory } from '@/common/types';
import { removeNullishValues } from '@/common/utils/remove-keys';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import ColorSelectField from '@/components/fields/color-select-field.vue';
import InputField from '@/components/fields/input-field.vue';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/lib/ui/alert-dialog';
import { Button } from '@/components/lib/ui/button';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { addCategories, removeCategories, useUserSettings } from '@/composable/data-queries/user-settings';
import { ApiErrorResponseError } from '@/js/errors';
import { useCategoriesStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { InfoIcon } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

const props = defineProps<{
  category?: FormattedCategory;
  parentCategory?: FormattedCategory;
  open?: boolean;
}>();

const emit = defineEmits<{
  saved: [category: FormattedCategory];
  deleted: [];
  'update:open': [value: boolean];
}>();

const isOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit('update:open', value);
  },
});

const internalOpen = ref(false);
const isSubmitting = ref(false);

const categoriesStore = useCategoriesStore();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
const { data: userSettings, mutateAsync: updateUserSettings } = useUserSettings();

const isEditMode = computed(() => !!props.category);
const isCreatingTopLevelCategory = computed(() => !isEditMode.value && !props.parentCategory);

const DEFAULT_CATEGORY_COLOR = '#df2063';

const form = reactive({
  name: '',
  color: DEFAULT_CATEGORY_COLOR,
  excludeFromStats: false,
});

const initialValues = reactive({
  name: '',
  color: DEFAULT_CATEGORY_COLOR,
  excludeFromStats: false,
});

const hasChanges = computed(() => {
  return (
    form.name !== initialValues.name ||
    form.color !== initialValues.color ||
    form.excludeFromStats !== initialValues.excludeFromStats
  );
});

const isSubmitDisabled = computed(() => {
  if (isSubmitting.value) return true;
  if (isEditMode.value && !hasChanges.value) return true;
  if (!isEditMode.value && !form.name.trim()) return true;
  return false;
});

const resetForm = () => {
  form.name = '';
  form.color = DEFAULT_CATEGORY_COLOR;
  form.excludeFromStats = false;
};

const initializeForm = () => {
  if (props.category) {
    const excludeFromStats =
      userSettings.value?.stats?.expenses?.excludedCategories?.includes(props.category.id) ?? false;

    form.name = props.category.name;
    form.color = props.category.color || DEFAULT_CATEGORY_COLOR;
    form.excludeFromStats = excludeFromStats;

    initialValues.name = props.category.name;
    initialValues.color = props.category.color || DEFAULT_CATEGORY_COLOR;
    initialValues.excludeFromStats = excludeFromStats;
  } else {
    resetForm();
    initialValues.name = '';
    initialValues.color = DEFAULT_CATEGORY_COLOR;
    initialValues.excludeFromStats = false;
  }
};

watch(isOpen, (open) => {
  if (open) {
    initializeForm();
  }
});

const handleSubmit = async () => {
  if (!form.name.trim()) return;

  isSubmitting.value = true;

  try {
    if (isEditMode.value && props.category) {
      await editCategory({
        categoryId: props.category.id,
        name: form.name.trim(),
      });

      await updateUserSettings(
        form.excludeFromStats
          ? addCategories(userSettings.value!, [props.category.id])
          : removeCategories(userSettings.value!, [props.category.id]),
      );

      addSuccessNotification('Category updated');
      await categoriesStore.loadCategories();
      emit('saved', { ...props.category, name: form.name.trim() });
    } else {
      type CreateParams = Parameters<typeof createCategory>[0];

      let params: CreateParams = { name: form.name.trim() };

      if (props.parentCategory) {
        params = removeNullishValues({
          ...params,
          imageUrl: props.parentCategory.imageUrl,
          color: props.parentCategory.color,
          parentId: props.parentCategory.id,
        }) as CreateParams;
      } else {
        // Top-level category - use selected color
        params.color = form.color;
      }

      const newCategory = await createCategory(params);

      if (form.excludeFromStats) {
        await updateUserSettings(addCategories(userSettings.value!, [newCategory.id]));
      }

      addSuccessNotification('Category created');
      await categoriesStore.loadCategories();

      const createdCategory = categoriesStore.categoriesMap[newCategory.id];
      if (createdCategory) {
        emit('saved', createdCategory as FormattedCategory);
      }
    }

    isOpen.value = false;
  } catch (err) {
    if (err instanceof ApiErrorResponseError) {
      addErrorNotification(err.data.message || 'Failed to save category');
    } else {
      addErrorNotification('Unexpected error');
    }
  } finally {
    isSubmitting.value = false;
  }
};

const handleDelete = async () => {
  if (!props.category) return;

  isSubmitting.value = true;

  try {
    await apiDeleteCategory({ categoryId: props.category.id });
    await categoriesStore.loadCategories();
    addSuccessNotification('Category deleted');
    emit('deleted');
    isOpen.value = false;
  } catch (err) {
    if (err instanceof ApiErrorResponseError) {
      if (err.data.code === API_ERROR_CODES.validationError) {
        addErrorNotification(err.data.message);
        return;
      }
    }
    addErrorNotification('Failed to delete category');
  } finally {
    isSubmitting.value = false;
  }
};
</script>
