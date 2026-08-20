<template>
  <span class="flex min-w-0 items-center gap-2">
    <AccountLogo v-if="hasLogo" :account="account" :class="logoClass" />
    <span
      v-else
      :class="
        cn(
          'border-border text-muted-foreground flex items-center justify-center rounded-md border border-dashed',
          logoClass,
        )
      "
    >
      <ArrowUpRightIcon class="size-3.5" />
    </span>
    <span :class="labelClass">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import AccountLogo from '@/components/common/account-logo.vue';
import { ArrowUpRightIcon } from '@lucide/vue';
import { cn } from '@/lib/utils';
import { isAccountArchived } from '@/common/utils/account-display';
import { AccountModel } from '@bt/shared/types';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    account: AccountModel & { _isOutOfWallet?: boolean };
    label: string;
    variant?: 'trigger' | 'item';
    archivedClass?: string;
  }>(),
  {
    variant: 'item',
    archivedClass: 'text-muted-foreground italic',
  },
);

// The OUT_OF_WALLET mock is a synthetic destination, not a real account, so it has nothing to show a logo for.
const hasLogo = computed(() => !props.account._isOutOfWallet);

const logoClass = computed(() => cn('shrink-0', props.variant === 'trigger' ? 'size-5' : 'size-6'));

const labelClass = computed(() => {
  if (props.variant === 'trigger') return 'truncate';
  return isAccountArchived(props.account) ? props.archivedClass : undefined;
});
</script>
