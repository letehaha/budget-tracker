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
import { computed } from 'vue';

export type OAuthProvider = 'google';

interface Props {
  provider: OAuthProvider;
  mode?: 'signin' | 'signup';
  isLoading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'signin',
  isLoading: false,
});

const emit = defineEmits<{
  click: [provider: OAuthProvider];
}>();

const providerConfig: Record<OAuthProvider, { name: string; icon: null }> = {
  google: { name: 'Google', icon: null },
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
