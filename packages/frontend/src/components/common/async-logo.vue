<script setup lang="ts">
import { cn } from '@/lib/utils';
import { computed, ref, useAttrs, watch } from 'vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** Resolved logo URL. Null = no logo available; renders an empty placeholder at the container's size. */
    url: string | null;
    /** Accessibility alt text. Defaults to empty (decorative — logos usually sit next to a text label). */
    alt?: string;
  }>(),
  { alt: '' },
);

const attrs = useAttrs();

const loaded = ref(false);
const errored = ref(false);

watch(
  () => props.url,
  () => {
    loaded.value = false;
    errored.value = false;
  },
);

const hasContent = computed(() => !!props.url && !errored.value);

// When there's no logo to render, omit the visible frame (bg-white, rounded
// borders) so the slot is empty space rather than a blank pill. Sizing always
// applies so the surrounding layout stays stable.
const containerClass = computed(() =>
  cn('size-6 shrink-0', hasContent.value && 'overflow-hidden rounded bg-white', attrs.class as string | undefined),
);
</script>

<template>
  <div :class="containerClass">
    <template v-if="hasContent && url">
      <img
        v-show="loaded"
        :src="url"
        :alt="alt"
        class="size-full object-contain"
        decoding="async"
        @load="loaded = true"
        @error="errored = true"
      />
      <div v-if="!loaded" class="bg-muted size-full animate-pulse" />
    </template>
  </div>
</template>
