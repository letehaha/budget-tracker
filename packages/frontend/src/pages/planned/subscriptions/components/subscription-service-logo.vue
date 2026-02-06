<script setup lang="ts">
import { findServiceByName, getServiceLogoUrl } from '@/common/utils/find-subscription-service';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  name: string;
  size?: 'sm' | 'md' | 'lg';
}>();

const SIZE_MAP = { sm: 20, md: 28, lg: 40 } as const;

const hasError = ref(false);
const isLoading = ref(false);

const service = computed(() => findServiceByName({ name: props.name }));

const logoUrl = computed(() => {
  if (!service.value) return null;
  return getServiceLogoUrl({ domain: service.value.domain });
});

const sizeInPx = computed(() => SIZE_MAP[props.size ?? 'sm']);

watch(logoUrl, () => {
  hasError.value = false;
  isLoading.value = !!logoUrl.value;
});

const handleLoad = () => {
  isLoading.value = false;
};

const handleError = () => {
  hasError.value = true;
  isLoading.value = false;
};
</script>

<template>
  <!-- Skeleton -->
  <div
    v-if="logoUrl && isLoading"
    class="bg-muted shrink-0 animate-pulse rounded"
    :style="{ width: `${sizeInPx}px`, height: `${sizeInPx}px` }"
  />
  <img
    v-if="logoUrl && !hasError"
    v-show="!isLoading"
    :src="logoUrl"
    :alt="service?.name"
    :width="sizeInPx"
    :height="sizeInPx"
    class="shrink-0 rounded bg-white"
    @load="handleLoad"
    @error="handleError"
  />
</template>
