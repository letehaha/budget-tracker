<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="sm:max-w-[425px]">
    <template #title>{{ $t('dialogs.reassignCategory.title') }}</template>
    <template #description>
      {{
        $t('dialogs.reassignCategory.description', {
          count: transactionCount,
          categoryName: category?.name,
        })
      }}
    </template>

    <div class="py-4">
      <CategorySelectField
        v-model="selectedCategory"
        :values="availableCategories"
        :label="$t('dialogs.reassignCategory.newCategoryLabel')"
        :placeholder="$t('dialogs.reassignCategory.newCategoryPlaceholder')"
      />
    </div>

    <template #footer="{ close }">
      <UiButton variant="ghost" @click="close">{{ $t('dialogs.reassignCategory.cancelButton') }}</UiButton>
      <UiButton variant="destructive" :disabled="!selectedCategory || isSubmitting" @click="handleReassign">
        <span v-if="isSubmitting">{{ $t('dialogs.reassignCategory.reassignButtonLoading') }}</span>
        <span v-else>{{ $t('dialogs.reassignCategory.reassignButton') }}</span>
      </UiButton>
    </template>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { deleteCategory as apiDeleteCategory } from '@/api';
import { type FormattedCategory } from '@/common/types';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useCategoriesStore } from '@/stores';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  open: boolean;
  category: FormattedCategory | null;
  transactionCount: number;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  deleted: [];
}>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const categoriesStore = useCategoriesStore();

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const selectedCategory = ref<FormattedCategory | null>(null);
const isSubmitting = ref(false);

const availableCategories = computed(() => {
  if (!props.category) return categoriesStore.formattedCategories;

  const filterOutCategory = (cats: FormattedCategory[]): FormattedCategory[] => {
    return cats
      .filter((cat) => cat.id !== props.category!.id)
      .map((cat) => ({
        ...cat,
        subCategories: cat.subCategories ? filterOutCategory(cat.subCategories) : [],
      }));
  };

  return filterOutCategory(categoriesStore.formattedCategories);
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedCategory.value = null;
    }
  },
);

const handleReassign = async () => {
  if (!props.category || !selectedCategory.value) return;

  isSubmitting.value = true;

  try {
    await apiDeleteCategory({
      categoryId: props.category.id,
      replaceWithCategoryId: selectedCategory.value.id,
    });
    await categoriesStore.loadCategories();
    addSuccessNotification(
      t('dialogs.reassignCategory.notifications.success', {
        count: props.transactionCount,
        newCategoryName: selectedCategory.value.name,
      }),
    );
    emit('deleted');
    isOpen.value = false;
  } catch {
    addErrorNotification(t('dialogs.reassignCategory.notifications.error'));
  } finally {
    isSubmitting.value = false;
  }
};
</script>
