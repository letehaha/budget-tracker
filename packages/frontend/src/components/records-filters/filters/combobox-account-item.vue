<template>
  <Combobox.ComboboxItem
    :value="account"
    :class="[
      'hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2.5 rounded-md py-1',
      indented ? 'pr-2 pl-8' : 'px-2',
      isSelected && 'bg-primary/5',
    ]"
    @select.prevent="emit('pick')"
  >
    <Checkbox :model-value="isSelected" class="size-3.5" @click.stop @update:model-value="emit('pick')" />
    <span class="min-w-0 flex-1 truncate">{{ account.name }}</span>
    <span class="text-muted-foreground shrink-0 text-xs">{{ account.currencyCode }}</span>
  </Combobox.ComboboxItem>
</template>

<script setup lang="ts">
import { Checkbox } from '@/components/lib/ui/checkbox';
import * as Combobox from '@/components/lib/ui/combobox';
import { AccountModel } from '@bt/shared/types';

defineProps<{
  account: AccountModel;
  isSelected: boolean;
  indented?: boolean;
}>();

const emit = defineEmits<{ pick: [] }>();
</script>
