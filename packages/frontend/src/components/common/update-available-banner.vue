<template>
  <transition
    enter-active-class="transition-all duration-300 ease-out"
    leave-active-class="transition-all duration-200 ease-in"
    enter-from-class="opacity-0 translate-y-4"
    leave-to-class="opacity-0 translate-y-4"
  >
    <div
      v-if="isStale"
      role="status"
      aria-live="polite"
      class="bg-popover text-popover-foreground xs:left-auto xs:w-90 fixed inset-x-4 bottom-4 z-(--z-notifications) flex items-start gap-3 rounded-lg border p-4 shadow-lg"
    >
      <div class="bg-primary/10 text-primary mt-0.5 flex size-8 flex-none items-center justify-center rounded-full">
        <RefreshCwIcon class="size-4" />
      </div>

      <div class="flex flex-1 flex-col gap-3">
        <div class="flex flex-col gap-1">
          <p class="text-sm leading-tight font-medium">
            {{ $t('common.appUpdate.title') }}
          </p>
          <p class="text-muted-foreground text-xs leading-snug">
            {{ $t('common.appUpdate.description') }}
          </p>
        </div>

        <div class="flex items-center justify-end">
          <Button size="sm" @click="reload">
            {{ $t('common.appUpdate.reload') }}
          </Button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { useVersionCheck } from '@/composable/use-version-check';
import { RefreshCwIcon } from '@lucide/vue';

const { isStale } = useVersionCheck();
const reload = () => window.location.reload();
</script>
