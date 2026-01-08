<template>
  <div class="relative min-h-dvh">
    <!-- Language Selector -->
    <div class="absolute right-4 top-4 z-10">
      <LanguageSelector variant="outline" show-label />
    </div>

    <router-view />
  </div>
</template>

<script setup lang="ts">
import LanguageSelector from '@/components/common/language-selector.vue';
</script>
