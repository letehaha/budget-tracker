<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core';
import type { RouteLocationRaw } from 'vue-router';

defineProps<{ to: RouteLocationRaw }>();

// A tap has to open the flyout instead of navigating, so on touch the trigger is a plain button
// and the page is reached through the links inside the flyout.
const isTouch = useMediaQuery('(pointer: coarse)');
</script>

<template>
  <button v-if="isTouch" type="button">
    <slot />
  </button>
  <router-link v-else :to="to">
    <slot />
  </router-link>
</template>
