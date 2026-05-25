<script setup lang="ts">
import { findServiceByName, getServiceLogoUrl } from '@/common/utils/find-subscription-service';
import AsyncLogo from '@/components/common/async-logo.vue';
import { computed } from 'vue';

const props = defineProps<{ name: string }>();

const service = computed(() => findServiceByName({ name: props.name }));

const logoUrl = computed(() => (service.value ? getServiceLogoUrl({ domain: service.value.domain }) : null));
</script>

<template>
  <AsyncLogo :url="logoUrl" />
</template>
