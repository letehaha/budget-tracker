<template>
  <div class="relative flex items-center py-2">
    <Separator class="flex-1" />
    <span class="text-muted-foreground bg-background px-4 text-sm">{{ text }}</span>
    <Separator class="flex-1" />
  </div>
</template>

<script lang="ts" setup>
import { Separator } from '@/components/lib/ui/separator';

interface Props {
  text?: string;
}

withDefaults(defineProps<Props>(), {
  text: 'Or continue with',
});
</script>
