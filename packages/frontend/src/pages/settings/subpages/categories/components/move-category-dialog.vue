<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>
      <i18n-t keypath="settings.categories.moveDialog.title" tag="span">
        <template #name>{{ category?.name }}</template>
      </i18n-t>
    </template>

    <template #description>{{ $t('settings.categories.moveDialog.description') }}</template>

    <form class="mt-4 grid gap-4" @submit.prevent="handleSubmit">
      <ParentCategorySelect v-if="category" v-model="parentId" :category="category" />

      <div class="flex justify-end">
        <Button type="submit" class="gap-1.5" :disabled="isSubmitting || !hasChanged">
          <LoaderCircleIcon v-if="isSubmitting" class="size-4 animate-spin" />
          {{ $t('settings.categories.moveDialog.moveButton') }}
        </Button>
      </div>
    </form>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { editCategory } from '@/api';
import { type FormattedCategory } from '@/common/types';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { useCategoriesStore } from '@/stores';
import { type RecordId } from '@bt/shared/types';
import { LoaderCircleIcon } from '@lucide/vue';
import { useVModel } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import ParentCategorySelect from './parent-category-select.vue';

const props = defineProps<{
  category?: FormattedCategory;
  open?: boolean;
}>();

const emit = defineEmits<{
  moved: [category: FormattedCategory];
  'update:open': [value: boolean];
}>();

const isOpen = useVModel(props, 'open', emit, { passive: true });

const { t } = useI18n();
const categoriesStore = useCategoriesStore();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const parentId = ref<RecordId | null>(null);
const isSubmitting = ref(false);

const hasChanged = computed(() => !!props.category && parentId.value !== props.category.parentId);

watch(
  isOpen,
  (open) => {
    if (open) parentId.value = props.category?.parentId ?? null;
  },
  { immediate: true },
);

const handleSubmit = async () => {
  if (!props.category || !hasChanged.value || isSubmitting.value) return;

  isSubmitting.value = true;

  try {
    await editCategory({ categoryId: props.category.id, parentId: parentId.value });

    addSuccessNotification(t('settings.categories.notifications.saveSuccess'));
    await categoriesStore.loadCategories({ force: true });
    emit('moved', props.category);
    isOpen.value = false;
  } catch (err) {
    if (err instanceof ApiErrorResponseError) {
      addErrorNotification(err.data.message || t('settings.categories.notifications.moveFailed'));
    } else {
      addErrorNotification(t('settings.categories.notifications.moveFailed'));
    }
  } finally {
    isSubmitting.value = false;
  }
};
</script>
