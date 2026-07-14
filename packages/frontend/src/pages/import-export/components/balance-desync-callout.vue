<script setup lang="ts">
/**
 * Balance-desync warning rendered on both importers' done steps: an account's
 * target balance could not be reconciled after the rows landed, so its
 * balance may now be wrong. Title/body are caller-supplied because each
 * importer keeps its own copy in its own i18n namespace.
 */
import { Callout } from '@/components/lib/ui/callout';
import type { ImportError } from '@bt/shared/types';
import { computed } from 'vue';

const props = defineProps<{ errors: ImportError[]; title: string; body: string }>();

/** Errors whose `code` marks a post-import account balance reconcile/restore failure. */
const desyncErrors = computed(() => props.errors.filter((e) => e.code === 'account-balance-desync'));
</script>

<template>
  <Callout v-if="desyncErrors.length > 0" variant="destructive" role="alert" :title="title">
    <p class="text-sm opacity-80">{{ body }}</p>
    <ul class="mt-2 list-disc space-y-0.5 pl-5 text-xs">
      <li v-for="(e, i) in desyncErrors" :key="i">{{ e.error }}</li>
    </ul>
  </Callout>
</template>
