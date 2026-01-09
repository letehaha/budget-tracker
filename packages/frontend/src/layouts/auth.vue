<template>
  <div class="relative min-h-dvh">
    <!-- Language Selector -->
    <div class="absolute top-4 right-4 z-10">
      <LanguageSelector variant="outline" show-label />
    </div>

    <router-view />
  </div>
</template>

<script setup lang="ts">
import LanguageSelector from '@/components/common/language-selector.vue';
</script>
