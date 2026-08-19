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
  <!-- logo.dev images are square — a square chip avoids letterboxing inside the 9×6 frame -->
  <img
    v-else-if="visual.kind === 'favicon' && !faviconFailed"
    :src="visual.src"
    alt=""
    class="border-border size-6 shrink-0 rounded-[5px] border object-cover"
    @error="faviconFailed = true"
  />
  <span
    v-else
    class="border-border bg-card text-muted-foreground grid h-6 w-9 shrink-0 place-items-center rounded-[5px] border text-[9px] font-bold tracking-wide"
    aria-hidden="true"
  >
    {{ fallbackCode }}
  </span>
</template>

<script lang="ts" setup>
import type { AvailableAccount } from '@/api/bank-data-providers';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { computed, ref } from 'vue';

import { resolveAccountVisual } from '../utils/account-visual';

const props = defineProps<{
  account: AvailableAccount;
  providerType: BANK_PROVIDER_TYPE | undefined;
}>();

const faviconFailed = ref(false);

const visual = computed(() =>
  resolveAccountVisual({
    providerType: props.providerType,
    type: props.account.type,
    currency: props.account.currency,
    metadata: props.account.metadata,
  }),
);

const fallbackCode = computed(() => {
  const value = visual.value;
  return value.kind === 'currency' || value.kind === 'favicon' ? value.code : '';
});
</script>
