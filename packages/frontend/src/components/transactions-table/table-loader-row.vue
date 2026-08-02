<script setup lang="ts">
defineProps<{ colspan: number }>();
</script>

<template>
  <tr class="h-10">
    <td :colspan="colspan" class="border-b px-3">
      <div class="bg-muted h-4 w-full max-w-120 animate-pulse rounded" />
    </td>
  </tr>
</template>
