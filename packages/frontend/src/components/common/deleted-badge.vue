<template>
  <span
    class="bg-muted text-muted-foreground inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-medium tracking-wider uppercase"
  >
    {{ $t('investments.trash.deletedBadge') }}
  </span>
</template>

<script setup lang="ts">
// Renders the "Deleted" badge shown next to a soft-deleted resource name
// (e.g. on transaction rows linked to a trashed portfolio). Pure presentational —
// callers control visibility with v-if.
</script>
