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
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
  return props.mode === 'register' ? t('auth.shared.passkeyButton.register') : t('auth.shared.passkeyButton.signIn');
});

const handleClick = () => {
  emit('click');
};
</script>
