<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import * as Popover from '@/components/lib/ui/popover';
</script>

<template>
  <Popover.Popover>
    <Popover.PopoverTrigger as-child>
      <Button variant="link" class="text-foreground h-auto gap-1 p-0 font-medium underline decoration-dotted">
        {{ $t('loans.detail.payment.sourceInfo.trigger') }}
      </Button>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent class="w-90 max-w-[calc(100vw-2rem)]" side="top" align="start">
      <h3 class="mb-2 font-semibold">{{ $t('loans.detail.payment.sourceInfo.title') }}</h3>
      <div class="text-muted-foreground space-y-2 text-sm">
        <p>{{ $t('loans.detail.payment.sourceInfo.manualOnly') }}</p>
        <p>{{ $t('loans.detail.payment.sourceInfo.whySynced') }}</p>
        <p>{{ $t('loans.detail.payment.sourceInfo.howToLink') }}</p>
      </div>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>
