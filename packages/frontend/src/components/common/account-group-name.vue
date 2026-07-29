<script setup lang="ts">
import { type AccountGroups } from '@/common/types/models';

import BankConnectionLogo, { type BankConnectionLogoSize } from './bank-connection-logo.vue';

defineProps<{
  group: AccountGroups;
  iconSize?: BankConnectionLogoSize;
}>();
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <BankConnectionLogo :connection-id="group.bankDataProviderConnectionId" :alt="group.name" :size="iconSize" />
    <span class="truncate"
      ><slot>{{ group.name }}</slot></span
    >
  </span>
</template>
