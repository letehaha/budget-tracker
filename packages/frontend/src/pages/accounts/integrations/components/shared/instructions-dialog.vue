<template>
  <ResponsiveDialog :open="open" dialog-content-class="sm:max-w-2xl" @update:open="emit('update:open', $event)">
    <template #title>
      <slot name="title">{{ title }}</slot>
    </template>

    <template #default="{ close }">
      <slot :close="close" />
    </template>

    <template v-if="$slots.footer" #footer="{ close }">
      <slot name="footer" :close="close" />
    </template>
  </ResponsiveDialog>
</template>

<script lang="ts" setup>
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';

defineProps<{
  open?: boolean;
  title?: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();
</script>
