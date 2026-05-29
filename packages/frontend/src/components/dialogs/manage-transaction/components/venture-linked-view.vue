<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { ROUTES_NAMES } from '@/routes';
import type { TransactionModel } from '@bt/shared/types';
import { DialogClose, DialogTitle } from 'reka-ui';
import { RouterLink } from 'vue-router';

defineProps<{
  transaction: TransactionModel;
}>();

const emit = defineEmits<{
  'close-modal': [];
}>();
</script>

<template>
  <div class="rounded-t-xl">
    <div class="bg-app-transfer-color h-3 rounded-t-lg" />
    <div class="mb-4 flex items-center justify-between px-6 py-3">
      <DialogTitle>
        <span class="text-2xl">
          {{ $t('dialogs.manageTransaction.ventureLinked.title') }}
        </span>
      </DialogTitle>

      <DialogClose>
        <Button variant="ghost" @click="emit('close-modal')">
          {{ $t('dialogs.manageTransaction.form.closeButton') }}
        </Button>
      </DialogClose>
    </div>

    <div class="px-6 pb-6">
      <div class="bg-muted/30 border-border rounded-lg border p-4">
        <p class="text-sm">
          {{ $t('dialogs.manageTransaction.ventureLinked.description') }}
        </p>
        <p class="text-muted-foreground mt-2 text-sm">
          {{ $t('dialogs.manageTransaction.ventureLinked.editHint') }}
        </p>
      </div>

      <RouterLink :to="{ name: ROUTES_NAMES.venture }" class="block" @click="emit('close-modal')">
        <Button variant="outline" class="mt-4 w-full">
          {{ $t('dialogs.manageTransaction.ventureLinked.openVenture') }}
        </Button>
      </RouterLink>
    </div>
  </div>
</template>
