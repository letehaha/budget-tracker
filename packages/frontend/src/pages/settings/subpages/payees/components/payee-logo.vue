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

// Container is always rendered; sizing comes from the pass-through class.
// The monogram fills it absolutely so it shows through when the logo is absent
// or still loading. AsyncLogo stacks on top: when it has content it renders a
// white rounded frame that covers the monogram; when url is null or the image
// errored, AsyncLogo renders nothing visible and the monogram shows through.
const containerClass = computed(() => cn('relative shrink-0', attrs.class as string | undefined));
</script>

<template>
  <div :class="containerClass">
    <!-- Monogram: always present as the base layer -->
    <div
      class="bg-primary/15 ring-primary/25 text-primary absolute inset-0 flex items-center justify-center rounded-lg text-sm font-bold uppercase ring-1"
      aria-hidden="true"
    >
      {{ monogramLetter }}
    </div>

    <!--
      AsyncLogo stacks above the monogram. When the image loads successfully,
      its white rounded container covers the monogram. When url is null, or the
      image 404s / errors, AsyncLogo renders an invisible empty div — the
      monogram beneath remains visible as the fallback.
    -->
    <AsyncLogo v-if="logoUrl" :url="logoUrl" :alt="name" class="absolute inset-0 size-full" />
  </div>
</template>
