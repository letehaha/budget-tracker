<script lang="ts" setup>
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { Button, type ButtonVariantProps } from '@/components/lib/ui/button';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { createReusableTemplate, useVModel } from '@vueuse/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const [UseTemplate, SlotContent] = createReusableTemplate();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const props = withDefaults(
  defineProps<{
    open?: boolean;
    cancelLabel?: string;
    confirmLabel?: string;
    confirmVariant?: ButtonVariantProps['variant'];
    confirmDisabled?: boolean;
  }>(),
  {
    cancelLabel: undefined,
    confirmLabel: undefined,
    confirmVariant: 'default',
    confirmDisabled: false,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
  cancel: [];
}>();

const isOpen = useVModel(props, 'open', emit, { passive: true });

const effectiveCancelLabel = computed(() => props.cancelLabel || t('common.actions.cancel'));
const effectiveConfirmLabel = computed(() => props.confirmLabel || t('common.actions.confirm'));

const handleCancel = () => {
  emit('cancel');
  isOpen.value = false;
};

const handleConfirm = () => {
  emit('confirm');
};
</script>

<template>
  <UseTemplate>
    <slot />
  </UseTemplate>

  <template v-if="isMobile">
    <Drawer.Drawer v-model:open="isOpen">
      <Drawer.DrawerContent class="px-4 pb-4">
        <Drawer.DrawerHeader class="mb-2 px-0 pb-0 text-center">
          <Drawer.DrawerTitle>
            <slot name="title" />
          </Drawer.DrawerTitle>
          <Drawer.DrawerDescription as="div">
            <slot name="description" />
          </Drawer.DrawerDescription>
        </Drawer.DrawerHeader>

        <SlotContent />

        <Drawer.DrawerFooter class="mt-4 flex-row gap-2 px-0">
          <Button variant="outline" class="flex-1" @click="handleCancel">
            {{ effectiveCancelLabel }}
          </Button>
          <Button :variant="confirmVariant" :disabled="confirmDisabled" class="flex-1" @click="handleConfirm">
            {{ effectiveConfirmLabel }}
          </Button>
        </Drawer.DrawerFooter>
      </Drawer.DrawerContent>
    </Drawer.Drawer>
  </template>
  <template v-else>
    <AlertDialog.AlertDialog v-model:open="isOpen">
      <AlertDialog.AlertDialogContent>
        <AlertDialog.AlertDialogHeader>
          <AlertDialog.AlertDialogTitle>
            <slot name="title" />
          </AlertDialog.AlertDialogTitle>
          <AlertDialog.AlertDialogDescription as="div">
            <slot name="description" />
          </AlertDialog.AlertDialogDescription>
        </AlertDialog.AlertDialogHeader>

        <SlotContent />

        <AlertDialog.AlertDialogFooter>
          <AlertDialog.AlertDialogCancel @click="handleCancel">
            {{ effectiveCancelLabel }}
          </AlertDialog.AlertDialogCancel>
          <AlertDialog.AlertDialogAction :variant="confirmVariant" :disabled="confirmDisabled" @click="handleConfirm">
            {{ effectiveConfirmLabel }}
          </AlertDialog.AlertDialogAction>
        </AlertDialog.AlertDialogFooter>
      </AlertDialog.AlertDialogContent>
    </AlertDialog.AlertDialog>
  </template>
</template>
