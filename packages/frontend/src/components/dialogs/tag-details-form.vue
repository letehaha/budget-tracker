<template>
  <form class="grid gap-4" @submit.prevent="$emit('submit')">
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
            <AlertDialogAction variant="destructive" @click="$emit('delete')">
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
</template>

<script setup lang="ts">
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
import { cn } from '@/lib/utils';
import { TagModel } from '@bt/shared/types';
import { ChevronsUpDownIcon } from 'lucide-vue-next';
import { defineAsyncComponent, ref } from 'vue';

const IconPickerDropdown = defineAsyncComponent(() => import('@/components/common/icons/icon-picker-dropdown.vue'));

defineProps<{
  form: {
    name: string;
    color: string;
    icon: string;
    description: string;
  };
  isEditMode: boolean;
  isSubmitting: boolean;
  isSubmitDisabled: boolean;
  tag?: TagModel;
}>();

defineEmits<{
  submit: [];
  delete: [];
}>();

const iconPickerOpen = ref(false);
</script>
