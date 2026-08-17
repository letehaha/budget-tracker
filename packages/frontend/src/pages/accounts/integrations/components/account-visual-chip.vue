<template>
  <img
    v-if="visual.kind === 'logo'"
    :src="visual.src"
    alt=""
    class="border-border h-6 w-9 shrink-0 rounded-[5px] border object-contain"
  />
  <span
    v-else-if="visual.kind === 'card'"
    class="relative h-6 w-9 shrink-0 overflow-hidden rounded-[5px] border border-white/15"
    :style="{ background: visual.gradient }"
    aria-hidden="true"
  >
    <span class="absolute bottom-1 left-1.5 h-1.75 w-2.5 rounded-[2px] bg-white/30" />
  </span>
  <span
    v-else
    class="border-border bg-card text-muted-foreground grid h-6 w-9 shrink-0 place-items-center rounded-[5px] border text-[9px] font-bold tracking-wide"
    aria-hidden="true"
  >
    {{ visual.code }}
  </span>
</template>

<script lang="ts" setup>
import type { AvailableAccount } from '@/api/bank-data-providers';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { computed } from 'vue';

import { resolveAccountVisual } from '../utils/account-visual';

const props = defineProps<{
  account: AvailableAccount;
  providerType: BANK_PROVIDER_TYPE | undefined;
}>();

const visual = computed(() =>
  resolveAccountVisual({
    providerType: props.providerType,
    type: props.account.type,
    currency: props.account.currency,
    metadata: props.account.metadata,
  }),
);
</script>
