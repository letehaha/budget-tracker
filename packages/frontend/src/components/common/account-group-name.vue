<script setup lang="ts">
import { type BankConnection, listConnections } from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { type AccountGroups } from '@/common/types/models';
import { getBankInstitutionLogoUrl } from '@/common/utils/find-bank-institution';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';

import BankProviderLogo from './bank-providers/bank-provider-logo.vue';

const props = defineProps<{
  group: AccountGroups;
  iconSize?: string;
}>();

const { data: bankConnections } = useQuery({
  queryFn: listConnections,
  queryKey: VUE_QUERY_CACHE_KEYS.bankConnections,
  staleTime: Infinity,
  placeholderData: [] as BankConnection[],
});

const connection = computed(() => {
  if (!props.group.bankDataProviderConnectionId) return null;
  return bankConnections.value?.find((c) => c.id === props.group.bankDataProviderConnectionId) ?? null;
});

const institutionLogoUrl = computed(() => {
  if (!connection.value?.bankName) return null;
  return getBankInstitutionLogoUrl({ bankName: connection.value.bankName });
});

const logoError = ref(false);

watch(institutionLogoUrl, () => {
  logoError.value = false;
});

const sizeClass = computed(() => props.iconSize ?? 'size-4');
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <img
      v-if="institutionLogoUrl && !logoError"
      :src="institutionLogoUrl"
      :alt="group.name"
      :class="['shrink-0', sizeClass]"
      @error="logoError = true"
    />
    <BankProviderLogo
      v-else-if="connection"
      :class="['shrink-0', sizeClass]"
      :provider="connection.providerType as BANK_PROVIDER_TYPE"
    />
    <span class="truncate"
      ><slot>{{ group.name }}</slot></span
    >
  </span>
</template>
