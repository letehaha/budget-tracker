<script setup lang="ts">
import type { AccountGroups } from '@/common/types/models';
import { cn } from '@/lib/utils';
import { FolderIcon, LandmarkIcon } from '@lucide/vue';
import { computed } from 'vue';

import BankConnectionLogo, { type BankConnectionLogoSize } from './bank-connection-logo.vue';
import BrandLogo from './brand-logo.vue';

/** Tailwind sizing utilities this logo is laid out against. */
export type GroupLogoSize = BankConnectionLogoSize | 'size-9';
export type GroupLogoRounding = 'md' | 'lg';

const ROUNDING_CLASS: Record<GroupLogoRounding, string> = {
  md: 'rounded-md',
  lg: 'rounded-lg',
};

// At the largest slot the bank logo sits inset in the muted tile rather than filling it.
const BANK_LOGO_SIZE: Record<GroupLogoSize, BankConnectionLogoSize> = {
  'size-4': 'size-4',
  'size-5': 'size-5',
  'size-7': 'size-7',
  'size-9': 'size-5',
};

// A bare outline glyph reads heavier than a filled logo tile, so it stays below the slot size.
const EMPTY_ICON_SIZE: Record<GroupLogoSize, string> = {
  'size-4': 'size-4',
  'size-5': 'size-5',
  'size-7': 'size-5',
  'size-9': 'size-5',
};

const props = withDefaults(
  defineProps<{
    group: Pick<AccountGroups, 'name' | 'logoDomain' | 'logoInitials' | 'logoColor' | 'bankDataProviderConnectionId'>;
    size?: GroupLogoSize;
    rounded?: GroupLogoRounding;
    /** `tile` frames the bank logo and the empty state in a muted square. */
    variant?: 'plain' | 'tile';
  }>(),
  { size: 'size-4', rounded: 'lg', variant: 'plain' },
);

const hasCustomLogo = computed(() => Boolean(props.group.logoDomain || props.group.logoInitials));

const bankLogoSize = computed(() => BANK_LOGO_SIZE[props.size]);
const brandLogoClass = computed(() => cn(props.size, ROUNDING_CLASS[props.rounded]));
const tileClass = computed(() =>
  cn('bg-muted flex shrink-0 items-center justify-center overflow-hidden', props.size, ROUNDING_CLASS[props.rounded]),
);
const emptyIconClass = computed(() => cn('text-muted-foreground shrink-0', EMPTY_ICON_SIZE[props.size]));
</script>

<template>
  <BrandLogo
    v-if="hasCustomLogo"
    :domain="group.logoDomain"
    :initials="group.logoInitials"
    :color="group.logoColor"
    :name="group.name"
    :class="brandLogoClass"
  />

  <div v-else-if="variant === 'tile'" :class="tileClass">
    <BankConnectionLogo
      v-if="group.bankDataProviderConnectionId"
      :connection-id="group.bankDataProviderConnectionId"
      :alt="group.name"
      :size="bankLogoSize"
    >
      <template #fallback>
        <LandmarkIcon class="text-muted-foreground size-1/2" aria-hidden="true" />
      </template>
    </BankConnectionLogo>
    <FolderIcon v-else class="text-muted-foreground size-1/2" aria-hidden="true" />
  </div>

  <BankConnectionLogo
    v-else-if="group.bankDataProviderConnectionId"
    :connection-id="group.bankDataProviderConnectionId"
    :alt="group.name"
    :size="bankLogoSize"
  />

  <FolderIcon v-else :class="emptyIconClass" aria-hidden="true" />
</template>
