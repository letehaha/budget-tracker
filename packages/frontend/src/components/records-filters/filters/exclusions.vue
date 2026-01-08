<template>
  <div>
    <p class="mb-2">{{ $t('transactions.filters.exclude.label') }}</p>

    <div class="flex gap-2">
      <label class="flex cursor-pointer items-center gap-2">
        <Checkbox :model-value="excludeRefunds" @update:model-value="$emit('update:exclude-refunds', $event)" />

        {{ $t('transactions.filters.exclude.refunds') }}
      </label>

      <label class="flex cursor-pointer items-center gap-2">
        <Checkbox :model-value="excludeTransfer" @update:model-value="$emit('update:exclude-transfer', $event)" />

        {{ $t('transactions.filters.exclude.transfers') }}
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
