<template>
  <div class="relative flex items-center py-2">
    <Separator class="flex-1" />
    <span class="text-muted-foreground bg-background px-4 text-sm">{{ displayText }}</span>
    <Separator class="flex-1" />
  </div>
</template>

<script lang="ts" setup>
import { Separator } from '@/components/lib/ui/separator';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface Props {
  text?: string;
}

const props = withDefaults(defineProps<Props>(), {
  text: undefined,
});

const displayText = computed(() => props.text || t('auth.shared.divider'));
</script>
