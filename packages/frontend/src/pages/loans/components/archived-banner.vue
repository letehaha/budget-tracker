<template>
  <div class="border-border/60 bg-muted/40 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
    <ArchiveIcon class="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <div class="text-sm font-semibold">{{ $t('loans.settings.archivedTitle') }}</div>
      <div class="text-muted-foreground text-sm">{{ $t('loans.settings.archivedDescription') }}</div>
    </div>
    <Button variant="outline" size="sm" :disabled="isPending" @click="unarchive({ loan })">
      <ArchiveRestoreIcon class="size-4" />
      {{ $t('loans.settings.unarchiveButton') }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { Button } from '@/components/lib/ui/button';
import { ArchiveIcon, ArchiveRestoreIcon } from '@lucide/vue';

import { useUnarchiveLoan } from '../composables/use-unarchive-loan';

defineProps<{ loan: LoanApi }>();

const { unarchive, isPending } = useUnarchiveLoan();
</script>
