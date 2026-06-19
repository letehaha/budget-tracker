<script setup lang="ts">
import { cn } from '@/lib/utils';
import { CheckIcon, MinusIcon, PlusIcon, SkipForwardIcon, SparklesIcon, XIcon, type LucideIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

type Status = 'auto-matched' | 'suggested' | 'will-create' | 'needs-attention' | 'invalid' | 'optional' | 'skipped';
type Size = 'xs' | 'sm' | 'default';

interface Props {
  status: Status;
  label?: string;
  size?: Size;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  size: 'default',
});

interface StatusConfig {
  /** Centered mark. Either a Lucide glyph or a literal character (no bare "!" exists in Lucide). */
  icon?: LucideIcon;
  glyph?: string;
  /** Tinted disc: faint fill + ring + mark colour, all derived from one semantic token. */
  circleClass: string;
}

/** i18n key for each status's default aria label. Resolved at render time so locale switches are reactive. */
const STATUS_ARIA_KEYS: Record<Status, string> = {
  'auto-matched': 'components.statusIndicator.autoMatched',
  suggested: 'components.statusIndicator.suggested',
  'will-create': 'components.statusIndicator.willCreate',
  'needs-attention': 'components.statusIndicator.needsAttention',
  invalid: 'components.statusIndicator.invalid',
  optional: 'components.statusIndicator.optional',
  skipped: 'components.statusIndicator.skipped',
};

const STATUS_CONFIG: Record<Status, StatusConfig> = {
  'auto-matched': {
    icon: CheckIcon,
    circleClass: 'bg-success-text/15 border-success-text/40 text-success-text',
  },
  suggested: {
    icon: SparklesIcon,
    circleClass: 'bg-warning-text/15 border-warning-text/40 text-warning-text',
  },
  'will-create': {
    icon: PlusIcon,
    circleClass: 'bg-success-text/15 border-success-text/40 text-success-text',
  },
  'needs-attention': {
    glyph: '!',
    circleClass: 'bg-warning-text/15 border-warning-text/40 text-warning-text',
  },
  invalid: {
    icon: XIcon,
    circleClass: 'bg-destructive-text/15 border-destructive-text/40 text-destructive-text',
  },
  optional: {
    icon: MinusIcon,
    circleClass: 'bg-muted-foreground/15 border-muted-foreground/40 text-muted-foreground',
  },
  skipped: {
    icon: SkipForwardIcon,
    circleClass: 'bg-muted-foreground/15 border-muted-foreground/40 text-muted-foreground',
  },
};

/** Disc / mark dimensions per size. The disc is the visible ring; the mark sits centred inside. */
const SIZE_CONFIG: Record<Size, { circle: string; icon: string; glyph: string }> = {
  xs: { circle: 'size-5', icon: 'size-3', glyph: 'text-[10px]' },
  sm: { circle: 'size-7', icon: 'size-4', glyph: 'text-sm' },
  default: { circle: 'size-8', icon: 'size-5', glyph: 'text-base' },
};

const config = computed<StatusConfig>(() => STATUS_CONFIG[props.status]);
const sizeClasses = computed(() => SIZE_CONFIG[props.size]);
/** Explicit `label` prop overrides the i18n default; when absent the aria key is resolved. */
const ariaLabel = computed(() => props.label ?? t(STATUS_ARIA_KEYS[props.status]));
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <span
      :class="
        cn(
          'inline-flex shrink-0 items-center justify-center rounded-full border',
          sizeClasses.circle,
          config.circleClass,
        )
      "
      role="img"
      :aria-label="!label ? ariaLabel : undefined"
      :aria-hidden="!!label"
    >
      <component :is="config.icon" v-if="config.icon" :class="cn(sizeClasses.icon, 'shrink-0')" aria-hidden="true" />
      <span v-else-if="config.glyph" :class="cn('leading-none font-bold', sizeClasses.glyph)" aria-hidden="true">
        {{ config.glyph }}
      </span>
    </span>
    <span v-if="label" class="text-sm">{{ label }}</span>
  </span>
</template>
