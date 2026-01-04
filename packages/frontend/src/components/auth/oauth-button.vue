<template>
  <Button type="button" variant="outline" class="w-full gap-2" :disabled="isLoading" @click="handleClick">
    <slot name="icon">
      <component :is="providerIcon" v-if="providerIcon" class="size-5" />
    </slot>
    <span>{{ buttonText }}</span>
  </Button>
</template>

<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { OAUTH_PROVIDER } from '@bt/shared/types';
import { computed } from 'vue';

interface Props {
  provider: OAUTH_PROVIDER;
  mode?: 'signin' | 'signup';
  isLoading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'signin',
  isLoading: false,
});

const emit = defineEmits<{
  click: [provider: OAUTH_PROVIDER];
}>();

const providerConfig: Record<OAUTH_PROVIDER, { name: string; icon: null }> = {
  [OAUTH_PROVIDER.google]: { name: 'Google', icon: null },
  [OAUTH_PROVIDER.github]: { name: 'GitHub', icon: null },
};

const providerIcon = computed(() => providerConfig[props.provider]?.icon);

const buttonText = computed(() => {
  const providerName = providerConfig[props.provider]?.name || props.provider;
  return props.mode === 'signup' ? `Sign up with ${providerName}` : `Sign in with ${providerName}`;
});

const handleClick = () => {
  emit('click', props.provider);
};
</script>
