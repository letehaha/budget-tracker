<template>
  <div>
    <p class="mb-2">Exlude:</p>

    <div class="flex gap-2">
      <label class="flex cursor-pointer items-center gap-2">
        <Checkbox :checked="excludeRefunds" @update:checked="$emit('update:exclude-refunds', $event)" />

        Refunds
      </label>

      <label class="flex cursor-pointer items-center gap-2">
        <Checkbox :checked="excludeTransfer" @update:checked="$emit('update:exclude-transfer', $event)" />

        Transfers
      </label>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';

defineProps({
  excludeRefunds: {
    type: Boolean,
    default: false,
  },
  excludeTransfer: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['update:exclude-refunds', 'update:exclude-transfer']);
</script>
