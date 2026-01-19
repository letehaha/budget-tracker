<script lang="ts" setup>
import Button from '@/components/lib/ui/button/Button.vue';

const emit = defineEmits<{
  dismiss: [];
}>();
</script>

<template>
  <div class="border-t p-4">
    <Button variant="ghost" class="text-muted-foreground w-full" @click="emit('dismiss')">
      Dismiss permanently
    </Button>
  </div>
</template>
