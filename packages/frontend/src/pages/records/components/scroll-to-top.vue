<template>
  <UiButton
    size="icon"
    :class="
      cn(
        'invisible fixed right-7 bottom-7 size-[50px] translate-y-2 rounded-full opacity-0 transition-transform duration-300',
        showScrollTopBtn && 'visible translate-y-0 opacity-100',
      )
    "
    @click="scrollTop"
  >
    Top
  </UiButton>
</template>

<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';
import { cn } from '@/lib/utils';
import { useWindowScroll } from '@vueuse/core';
import { computed } from 'vue';

const { y: scrollY } = useWindowScroll();
const showScrollTopBtn = computed(() => scrollY.value > 300);

const scrollTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
</script>
