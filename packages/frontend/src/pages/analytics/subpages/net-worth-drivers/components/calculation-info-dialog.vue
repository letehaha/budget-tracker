<template>
  <ResponsiveDialog dialog-content-class="max-w-lg">
    <template #trigger>
      <UiButton variant="link" class="text-muted-foreground h-auto gap-1.5 p-0 text-xs font-normal">
        <InfoIcon class="size-3.5" />
        {{ $t('netWorthDrivers.calcInfo.trigger') }}
      </UiButton>
    </template>

    <template #title>{{ $t('netWorthDrivers.calcInfo.title') }}</template>

    <div class="space-y-4 text-sm">
      <div>
        <div class="font-medium">{{ $t('netWorthDrivers.calcInfo.savedHeading') }}</div>
        <p class="text-muted-foreground mt-0.5">{{ $t('netWorthDrivers.calcInfo.savedBody') }}</p>
      </div>

      <div>
        <div class="font-medium">{{ $t('netWorthDrivers.calcInfo.grownHeading') }}</div>
        <p class="text-muted-foreground mt-0.5">{{ $t('netWorthDrivers.calcInfo.grownBody') }}</p>
      </div>

      <div class="border-border bg-card rounded-lg border p-3">
        <div class="font-medium">{{ $t('netWorthDrivers.calcInfo.exampleHeading') }}</div>
        <p class="text-muted-foreground mt-0.5">{{ $t('netWorthDrivers.calcInfo.exampleBody') }}</p>
      </div>

      <p class="text-muted-foreground text-xs">{{ $t('netWorthDrivers.calcInfo.noteBody') }}</p>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { InfoIcon } from '@lucide/vue';
</script>
