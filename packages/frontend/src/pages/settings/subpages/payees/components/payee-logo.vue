<script setup lang="ts">
import AsyncLogo from '@/components/common/async-logo.vue';
import { getServiceLogoUrl } from '@/common/utils/logo-url';
import { cn } from '@/lib/utils';
import { computed, useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** Resolved brand domain (e.g. "amazon.com"). Null = show monogram. */
  domain: string | null;
  /** Payee name — used to derive the monogram letter. */
  name: string;
}>();

const attrs = useAttrs();

const logoUrl = computed(() => (props.domain ? getServiceLogoUrl({ domain: props.domain }) : null));

const monogramLetter = computed(() => props.name.trim().charAt(0).toUpperCase() || '·');

// One radius governs the whole stack: the container sets it, the monogram and
// the logo frame inherit it via `rounded-[inherit]`, and the ring traces the
// same corners. The logo image, its background fill, and any control a consumer
// overlays (e.g. the detail page's edit button) must share a single radius —
// otherwise the smaller-radius layer leaves a visible sliver of the larger one
// at each corner. The default is overridable via the pass-through class (e.g.
// `rounded-md` at small sizes).
const containerClass = computed(() =>
  cn('relative shrink-0 rounded-lg ring-1 ring-primary/15', attrs.class as string | undefined),
);
</script>

<template>
  <div :class="containerClass">
    <!-- Monogram: always present as the base layer, visible when no logo is
         resolved or while the image is still loading. -->
    <div
      class="bg-primary/15 text-primary absolute inset-0 flex items-center justify-center rounded-[inherit] text-sm font-bold uppercase"
      aria-hidden="true"
    >
      {{ monogramLetter }}
    </div>

    <!--
      AsyncLogo stacks above the monogram. When the image loads its white frame
      covers the monogram; when url is null or the image errors it renders
      nothing and the monogram shows through. `rounded-[inherit]` makes the
      frame trace the container's corners exactly.
    -->
    <AsyncLogo v-if="logoUrl" :url="logoUrl" :alt="name" class="absolute inset-0 size-full rounded-[inherit]" />
  </div>
</template>
