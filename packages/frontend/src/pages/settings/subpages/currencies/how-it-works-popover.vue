<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="link"
        size="sm"
        class="text-muted-foreground hover:text-foreground h-auto gap-1 p-0 align-baseline text-sm"
      >
        <InfoIcon class="size-3.5" />
        {{ $t('settings.currencies.howItWorks.trigger') }}
      </Button>
    </PopoverTrigger>

    <PopoverContent class="max-w-90 text-sm leading-6" align="start">
      <p>{{ $t('settings.currencies.howItWorks.body') }}</p>
      <p class="mt-2">
        <DocsLink path="/settings/base-currency-and-currencies/" />
      </p>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import DocsLink from '@/components/common/docs-link.vue';
import { Button } from '@/components/lib/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { InfoIcon } from '@lucide/vue';
</script>
