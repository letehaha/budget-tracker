<script lang="ts" setup>
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import type { ButtonVariantProps } from '@/components/lib/ui/button';

defineEmits(['accept', 'cancel']);
withDefaults(
  defineProps<{
    title: string;
    description?: string; // "description" slot can be used to pass template
    cancelLabel?: string;
    acceptLabel?: string;
    acceptVariant?: ButtonVariantProps['variant'];
    acceptDisabled?: boolean;
  }>(),
  {
    description: undefined,
    cancelLabel: 'Cancel',
    acceptLabel: 'Accept',
    acceptDisabled: false,
    acceptVariant: 'default',
  },
);
</script>

<template>
  <AlertDialog.AlertDialog>
    <AlertDialog.AlertDialogTrigger as-child>
      <slot name="trigger"></slot>
    </AlertDialog.AlertDialogTrigger>
    <AlertDialog.AlertDialogContent>
      <slot>
        <AlertDialog.AlertDialogHeader>
          <AlertDialog.AlertDialogTitle v-if="title">
            {{ title }}
          </AlertDialog.AlertDialogTitle>

          <AlertDialog.AlertDialogDescription v-if="description || $slots.description">
            <slot name="description">
              {{ description }}
            </slot>
          </AlertDialog.AlertDialogDescription>

          <slot name="content" />
        </AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogFooter>
          <AlertDialog.AlertDialogCancel @click="$emit('cancel')">
            {{ cancelLabel }}
          </AlertDialog.AlertDialogCancel>
          <AlertDialog.AlertDialogAction :disabled="acceptDisabled" :variant="acceptVariant" @click="$emit('accept')">
            {{ acceptLabel }}
          </AlertDialog.AlertDialogAction>
        </AlertDialog.AlertDialogFooter>
      </slot>
    </AlertDialog.AlertDialogContent>
  </AlertDialog.AlertDialog>
</template>
