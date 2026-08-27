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
        <i18n-t keypath="dialogs.categoryForm.description.addSubcategory" tag="span">
          <template #parentName>
            <strong>{{ parentCategory.name }}</strong>
          </template>
        </i18n-t>
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

      <ParentCategorySelect v-model="form.parentId" :category="props.category" />

      <div class="grid grid-cols-2 gap-4">
        <ColorSelectField
          v-model="form.color"
          :label="$t('dialogs.categoryForm.colorLabel')"
          :class="cn(isInheritColorVisible && 'col-span-2')"
        >
          <template v-if="isInheritColorVisible" #field-right>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="border-input bg-muted hover:bg-muted hover:text-primary-text h-auto self-stretch rounded-l-none rounded-r-md border px-3 text-xs font-medium"
              @click="inheritParentColor"
            >
              {{ $t('dialogs.categoryForm.inheritParentColor') }}
            </Button>
          </template>
        </ColorSelectField>

        <!-- Icon Picker -->
        <FieldLabel
          :label="$t('dialogs.categoryForm.iconLabel')"
          only-template
          :class="cn(isInheritColorVisible && 'col-span-2')"
        >
          <Popover v-model:open="iconPickerOpen">
            <PopoverTrigger as-child>
              <button
                type="button"
                :class="
                  cn(
                    'border-input bg-input-background ring-offset-background focus-visible:ring-ring flex h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
                    !form.icon && 'text-muted-foreground',
                  )
                "
              >
                <TagIcon v-if="form.icon" :name="form.icon" class="size-4 shrink-0" />
                <span class="flex-1 truncate text-left">
                  {{ form.icon || $t('dialogs.categoryForm.iconPlaceholder') }}
                </span>
                <ChevronsUpDownIcon class="text-muted-foreground size-4 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent class="w-[320px] p-2" align="start">
              <IconPickerDropdown
                :model-value="form.icon ?? undefined"
                @update:model-value="form.icon = $event"
                @close="iconPickerOpen = false"
              />
            </PopoverContent>
          </Popover>
        </FieldLabel>
      </div>

      <div class="mt-2 flex justify-end">
        <Button type="submit" :disabled="isSubmitDisabled">
          {{ isEditMode ? $t('dialogs.categoryForm.saveButton') : $t('dialogs.categoryForm.createButton') }}
        </Button>
      </div>
    </form>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { createCategory, editCategory } from '@/api';
import { type FormattedCategory } from '@/common/types';
import { isNil, omitBy } from 'lodash-es';
import TagIcon from '@/components/common/icons/tag-icon.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import ColorSelectField from '@/components/fields/color-select-field.vue';
import FieldLabel from '@/components/fields/components/field-label.vue';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { cn } from '@/lib/utils';
import ParentCategorySelect from '@/pages/settings/subpages/categories/components/parent-category-select.vue';
import { useCategoriesStore, useOnboardingStore } from '@/stores';
import { type RecordId } from '@bt/shared/types';
import { ChevronsUpDownIcon } from '@lucide/vue';
import { useVModel } from '@vueuse/core';
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const IconPickerDropdown = defineAsyncComponent(() => import('@/components/common/icons/icon-picker-dropdown.vue'));

const props = defineProps<{
  category?: FormattedCategory;
  parentCategory?: FormattedCategory;
  open?: boolean;
}>();

const emit = defineEmits<{
  saved: [category: FormattedCategory];
  'update:open': [value: boolean];
}>();

const isOpen = useVModel(props, 'open', emit, { passive: true });

const isSubmitting = ref(false);

const { t } = useI18n();
const categoriesStore = useCategoriesStore();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const isEditMode = computed(() => !!props.category);

const DEFAULT_CATEGORY_COLOR = '#df2063';

const iconPickerOpen = ref(false);

const form = reactive({
  name: '',
  color: DEFAULT_CATEGORY_COLOR,
  icon: '' as string | null,
  parentId: null as RecordId | null,
});

const initialValues = reactive({
  name: '',
  color: DEFAULT_CATEGORY_COLOR,
  icon: '' as string | null,
  parentId: null as RecordId | null,
});

const hasNameChanged = computed(() => form.name !== initialValues.name);
const hasColorChanged = computed(() => form.color !== initialValues.color);
const hasIconChanged = computed(() => form.icon !== initialValues.icon);
const hasParentChanged = computed(() => form.parentId !== initialValues.parentId);

const hasChanges = computed(() => {
  return hasNameChanged.value || hasColorChanged.value || hasIconChanged.value || hasParentChanged.value;
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
  form.icon = null;
  form.parentId = null;
};

const initializeForm = () => {
  if (props.category) {
    form.name = props.category.name;
    form.color = props.category.color || DEFAULT_CATEGORY_COLOR;
    form.icon = props.category.icon || null;
    form.parentId = props.category.parentId;

    initialValues.name = props.category.name;
    initialValues.color = props.category.color || DEFAULT_CATEGORY_COLOR;
    initialValues.icon = props.category.icon || null;
    initialValues.parentId = props.category.parentId;
  } else {
    resetForm();
    form.parentId = props.parentCategory?.id ?? null;
    initialValues.name = '';
    initialValues.color = DEFAULT_CATEGORY_COLOR;
    initialValues.icon = null;
    initialValues.parentId = form.parentId;
  }
};

const selectedParent = computed(() => (form.parentId ? categoriesStore.categoriesMap[form.parentId] : undefined));
const isInheritColorVisible = computed(() => !isEditMode.value && !!selectedParent.value);

const inheritParentColor = () => {
  form.color = selectedParent.value?.color || DEFAULT_CATEGORY_COLOR;
};

// Picking a parent while creating pre-fills color and icon from it; the user can override after.
watch(
  () => form.parentId,
  (parentId) => {
    if (isEditMode.value || !parentId) return;

    const parent = categoriesStore.categoriesMap[parentId];
    if (!parent) return;

    form.color = parent.color || DEFAULT_CATEGORY_COLOR;
    form.icon = parent.icon || null;
  },
);

watch(
  isOpen,
  (open) => {
    if (open) {
      initializeForm();
    }
  },
  { immediate: true },
);

const handleSubmit = async () => {
  if (!hasChanges.value) return;

  isSubmitting.value = true;

  try {
    if (isEditMode.value && props.category) {
      await editCategory({
        categoryId: props.category.id,
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
        ...(hasParentChanged.value ? { parentId: form.parentId } : {}),
      });

      addSuccessNotification(t('dialogs.categoryForm.notifications.updated'));
      await categoriesStore.loadCategories({ force: true });
      emit('saved', { ...props.category, name: form.name.trim(), color: form.color });
    } else {
      type CreateParams = Parameters<typeof createCategory>[0];

      const params = omitBy(
        {
          name: form.name.trim(),
          color: form.color,
          icon: form.icon,
          parentId: form.parentId,
        },
        isNil,
      ) as CreateParams;

      const newCategory = await createCategory(params);

      addSuccessNotification(t('dialogs.categoryForm.notifications.created'));
      await categoriesStore.loadCategories({ force: true });

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
</script>
