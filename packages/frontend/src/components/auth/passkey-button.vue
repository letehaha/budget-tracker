<template>
  <Button type="button" variant="outline" class="w-full gap-2" :disabled="isLoading" @click="handleClick">
    <KeyRoundIcon class="size-5" />
    <span>{{ buttonText }}</span>
  </Button>
</template>

<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { KeyRoundIcon } from 'lucide-vue-next';
import { computed } from 'vue';

interface Props {
  mode?: 'signin' | 'register';
  isLoading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'signin',
  isLoading: false,
});

const emit = defineEmits<{
  click: [];
}>();

const buttonText = computed(() => {
  return props.mode === 'register' ? 'Add Passkey' : 'Sign in with Passkey';
});

const handleClick = () => {
  emit('click');
};
</script>
