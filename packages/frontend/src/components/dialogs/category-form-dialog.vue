<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>
      {{ isEditMode ? $t('dialogs.categoryForm.title.edit') : $t('dialogs.categoryForm.title.add') }}
    </template>

    <template #description>
      <template v-if="parentCategory">
        <span
          v-html="$t('dialogs.categoryForm.description.addSubcategory', { parentName: parentCategory.name })"
        ></span>
      </template>
      <template v-else-if="isEditMode"> {{ $t('dialogs.categoryForm.description.edit') }} </template>
      <template v-else> {{ $t('dialogs.categoryForm.description.add') }} </template>
    </template>

    <form class="mt-4 grid gap-4" @submit.prevent="handleSubmit">
      <InputField
        v-model="form.name"
        :label="$t('dialogs.categoryForm.nameLabel')"
        :placeholder="$t('dialogs.categoryForm.namePlaceholder')"
        autofocus
      />

      <ColorSelectField
        v-if="isCreatingTopLevelCategory"
        v-model="form.color"
        :label="$t('dialogs.categoryForm.colorLabel')"
      />

      <div class="flex items-center gap-3">
        <div class="bg-border h-px flex-1" />
        <span class="text-muted-foreground text-xs">{{ $t('dialogs.categoryForm.settingsDivider') }}</span>
        <div class="bg-border h-px flex-1" />
      </div>

      <div class="flex items-center gap-3">
        <label class="flex cursor-pointer items-center gap-3">
          <Checkbox v-model="form.excludeFromStats" />
          <span class="text-sm">{{ $t('dialogs.categoryForm.excludeFromStatsLabel') }}</span>
        </label>

        <ResponsiveTooltip
          :content="$t('dialogs.categoryForm.excludeFromStatsTooltip')"
          content-class-name="max-w-[250px]"
        >
          <InfoIcon class="text-muted-foreground size-4" />
        </ResponsiveTooltip>
      </div>

      <div class="mt-2 flex items-center" :class="isEditMode ? 'justify-between' : 'justify-end'">
        <AlertDialog v-if="isEditMode">
          <AlertDialogTrigger as-child>
            <Button type="button" variant="destructive" :disabled="isSubmitting">
              {{ $t('dialogs.categoryForm.deleteButton') }}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{{ $t('dialogs.categoryForm.deleteDialog.title') }}</AlertDialogTitle>
              <AlertDialogDescription>
                {{ $t('dialogs.categoryForm.deleteDialog.description', { categoryName: category?.name }) }}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{{ $t('dialogs.categoryForm.deleteDialog.cancelButton') }}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" @click="handleDelete">{{
                $t('dialogs.categoryForm.deleteDialog.deleteButton')
              }}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button type="submit" :disabled="isSubmitDisabled">
          {{ isEditMode ? $t('dialogs.categoryForm.saveButton') : $t('dialogs.categoryForm.createButton') }}
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
import { useCategoriesStore, useOnboardingStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { InfoIcon } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

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

const { t } = useI18n();
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

const hasNameChanged = computed(() => form.name !== initialValues.name);
const hasColorChanged = computed(() => form.color !== initialValues.color);
const hasExcludeFromStatsChanged = computed(() => form.excludeFromStats !== initialValues.excludeFromStats);
const hasCategoryFieldsChanged = computed(() => hasNameChanged.value || hasColorChanged.value);

const hasChanges = computed(() => {
  return hasCategoryFieldsChanged.value || hasExcludeFromStatsChanged.value;
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

watch(
  isOpen,
  (open) => {
    if (open) {
      initializeForm();
    }
  },
  { immediate: true },
);

// Re-initialize form when userSettings loads (handles page refresh case)
watch(
  () => userSettings.value,
  () => {
    if (isOpen.value) {
      initializeForm();
    }
  },
);

const handleSubmit = async () => {
  if (!hasChanges.value) return;

  isSubmitting.value = true;

  try {
    if (isEditMode.value && props.category) {
      if (hasCategoryFieldsChanged.value) {
        await editCategory({
          categoryId: props.category.id,
          name: form.name.trim(),
        });
      }

      if (hasExcludeFromStatsChanged.value) {
        await updateUserSettings(
          form.excludeFromStats
            ? addCategories(userSettings.value!, [props.category.id])
            : removeCategories(userSettings.value!, [props.category.id]),
        );
      }

      addSuccessNotification(t('dialogs.categoryForm.notifications.updated'));
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

      addSuccessNotification(t('dialogs.categoryForm.notifications.created'));
      await categoriesStore.loadCategories();

      // Mark onboarding task as complete
      const onboardingStore = useOnboardingStore();
      onboardingStore.completeTask('create-category');

      const createdCategory = categoriesStore.categoriesMap[newCategory.id];
      if (createdCategory) {
        emit('saved', createdCategory as FormattedCategory);
      }
    }

    isOpen.value = false;
  } catch (err) {
    if (err instanceof ApiErrorResponseError) {
      addErrorNotification(err.data.message || t('dialogs.categoryForm.notifications.saveFailed'));
    } else {
      addErrorNotification(t('dialogs.categoryForm.notifications.unexpectedError'));
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
    addSuccessNotification(t('dialogs.categoryForm.notifications.deleted'));
    emit('deleted');
    isOpen.value = false;
  } catch (err) {
    if (err instanceof ApiErrorResponseError) {
      if (err.data.code === API_ERROR_CODES.validationError) {
        addErrorNotification(err.data.message);
        return;
      }
    }
    addErrorNotification(t('dialogs.categoryForm.notifications.deleteFailed'));
  } finally {
    isSubmitting.value = false;
  }
};
</script>
