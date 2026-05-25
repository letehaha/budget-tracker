<script setup lang="ts">
import { getSecurityLogoUrl, type SecurityLogoSource } from '@/common/utils/security-logo-url';
import AsyncLogo from '@/components/common/async-logo.vue';
import { computed } from 'vue';

const props = defineProps<{ security: SecurityLogoSource }>();

const url = computed(() => getSecurityLogoUrl(props.security));
</script>

<template>
  <!-- Ring/circle only when there's an actual logo to frame. Without a URL,
       AsyncLogo also drops its bg-white, so the slot renders as empty space. -->
  <AsyncLogo :url="url" :class="url ? 'ring-border/40 rounded-full ring-1' : ''" />
</template>
