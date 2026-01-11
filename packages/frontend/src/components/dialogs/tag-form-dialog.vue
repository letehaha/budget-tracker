<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>
      {{ isEditMode ? $t('settings.tags.form.editTitle') : $t('settings.tags.form.createTitle') }}
    </template>

    <form class="mt-4 grid gap-4" @submit.prevent="handleSubmit">
      <InputField
        v-model="form.name"
        :label="$t('settings.tags.form.name')"
        :placeholder="$t('settings.tags.form.namePlaceholder')"
        autofocus
      />

      <div class="grid grid-cols-2 gap-4">
        <ColorSelectField v-model="form.color" :label="$t('settings.tags.form.color')" />

        <!-- Icon Picker -->
        <FieldLabel :label="$t('settings.tags.form.icon')" only-template>
          <Popover v-model:open="iconPickerOpen">
            <PopoverTrigger as-child>
              <button
                type="button"
                :class="
                  cn(
                    'border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
                    !form.icon && 'text-muted-foreground',
                  )
                "
              >
                <TagIcon v-if="form.icon" :name="form.icon" class="size-4 shrink-0" />
                <span class="flex-1 truncate text-left">
                  {{ form.icon || $t('settings.tags.form.iconPlaceholder') }}
                </span>
                <ChevronsUpDownIcon class="text-muted-foreground size-4 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent class="w-[320px] p-2" align="start">
              <IconPickerDropdown
                :model-value="form.icon"
                @update:model-value="form.icon = $event"
                @close="iconPickerOpen = false"
              />
            </PopoverContent>
          </Popover>
        </FieldLabel>
      </div>

      <!-- Preview -->
      <div class="bg-muted/50 flex items-center justify-center gap-4 rounded-lg p-4">
        <div class="flex size-8 items-center justify-center rounded-full" :style="{ backgroundColor: form.color }">
          <TagIcon v-if="form.icon" :name="form.icon" class="size-4 text-white" />
        </div>
        <span
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium text-white"
          :style="{ backgroundColor: form.color }"
        >
          <TagIcon v-if="form.icon" :name="form.icon" class="size-3.5" />
          {{ form.name || $t('settings.tags.form.previewPlaceholder') }}
        </span>
      </div>

      <TextareaField
        v-model="form.description"
        :label="$t('settings.tags.form.description')"
        :placeholder="$t('settings.tags.form.descriptionPlaceholder')"
        :rows="2"
      />

      <div class="mt-2 flex items-center" :class="isEditMode ? 'justify-between' : 'justify-end'">
        <AlertDialog v-if="isEditMode">
          <AlertDialogTrigger as-child>
            <Button type="button" variant="destructive" :disabled="isSubmitting">
              {{ $t('common.actions.delete') }}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{{ $t('settings.tags.delete.title') }}</AlertDialogTitle>
              <AlertDialogDescription>
                {{ $t('settings.tags.delete.description', { name: tag?.name }) }}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{{ $t('settings.tags.delete.cancelButton') }}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" @click="handleDelete">
                {{ $t('settings.tags.delete.deleteButton') }}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button type="submit" :disabled="isSubmitDisabled">
          {{ $t('settings.tags.form.saveButton') }}
        </Button>
      </div>
    </form>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import TagIcon from '@/components/common/icons/tag-icon.vue';
import ColorSelectField from '@/components/fields/color-select-field.vue';
import FieldLabel from '@/components/fields/components/field-label.vue';
import InputField from '@/components/fields/input-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { cn } from '@/lib/utils';
import { useTagsStore } from '@/stores';
import { TagModel } from '@bt/shared/types';
import { ChevronsUpDownIcon } from 'lucide-vue-next';
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const IconPickerDropdown = defineAsyncComponent(
  () => import('@/components/common/icons/icon-picker-dropdown.vue'),
);

const props = defineProps<{
  tag?: TagModel;
  open?: boolean;
}>();

const emit = defineEmits<{
  saved: [tag: TagModel];
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
const iconPickerOpen = ref(false);

const { t } = useI18n();
const tagsStore = useTagsStore();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const isEditMode = computed(() => !!props.tag);

const DEFAULT_TAG_COLOR = '#3b82f6';

const form = reactive({
  name: '',
  color: DEFAULT_TAG_COLOR,
  icon: '',
  description: '',
});

const initialValues = reactive({
  name: '',
  color: DEFAULT_TAG_COLOR,
  icon: '',
  description: '',
});

const hasChanges = computed(() => {
  return (
    form.name !== initialValues.name ||
    form.color !== initialValues.color ||
    form.icon !== initialValues.icon ||
    form.description !== initialValues.description
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
  form.color = DEFAULT_TAG_COLOR;
  form.icon = '';
  form.description = '';
};

const initializeForm = () => {
  if (props.tag) {
    form.name = props.tag.name;
    form.color = props.tag.color;
    form.icon = props.tag.icon || '';
    form.description = props.tag.description || '';

    initialValues.name = props.tag.name;
    initialValues.color = props.tag.color;
    initialValues.icon = props.tag.icon || '';
    initialValues.description = props.tag.description || '';
  } else {
    resetForm();
    initialValues.name = '';
    initialValues.color = DEFAULT_TAG_COLOR;
    initialValues.icon = '';
    initialValues.description = '';
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

const handleSubmit = async () => {
  if (!form.name.trim()) return;

  isSubmitting.value = true;

  try {
    const payload = {
      name: form.name.trim(),
      color: form.color,
      icon: form.icon.trim() || null,
      description: form.description.trim() || null,
    };

    if (isEditMode.value && props.tag) {
      const updatedTag = await tagsStore.updateTag({ id: props.tag.id, payload });
      addSuccessNotification(t('settings.tags.notifications.updateSuccess'));
      emit('saved', updatedTag);
    } else {
      const newTag = await tagsStore.createTag(payload);
      addSuccessNotification(t('settings.tags.notifications.createSuccess'));
      emit('saved', newTag);
    }

    isOpen.value = false;
  } catch (err) {
    if (err instanceof ApiErrorResponseError) {
      addErrorNotification(err.data.message || t('settings.tags.notifications.updateFailed'));
    } else {
      addErrorNotification(
        isEditMode.value
          ? t('settings.tags.notifications.updateFailed')
          : t('settings.tags.notifications.createFailed'),
      );
    }
  } finally {
    isSubmitting.value = false;
  }
};

const handleDelete = async () => {
  if (!props.tag) return;

  isSubmitting.value = true;

  try {
    await tagsStore.deleteTag({ id: props.tag.id });
    addSuccessNotification(t('settings.tags.notifications.deleteSuccess'));
    emit('deleted');
    isOpen.value = false;
  } catch (err) {
    if (err instanceof ApiErrorResponseError) {
      addErrorNotification(err.data.message || t('settings.tags.notifications.deleteFailed'));
    } else {
      addErrorNotification(t('settings.tags.notifications.deleteFailed'));
    }
  } finally {
    isSubmitting.value = false;
  }
};
</script>
