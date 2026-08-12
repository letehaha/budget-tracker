<template>
  <div class="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
    <TriangleAlertIcon class="text-muted-foreground size-10" />
    <p class="text-muted-foreground text-sm">{{ message }}</p>
    <Button variant="outline" size="sm" @click="emit('retry')">
      {{ $t('common.actions.retry') }}
    </Button>
  </div>
</template>

<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { TriangleAlertIcon } from '@lucide/vue';

defineProps<{
  message: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>
