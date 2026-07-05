<template>
  <div class="flex min-w-0 flex-1 items-center gap-2">
    <slot name="leading" />
    <span class="min-w-0 flex-1 truncate text-left font-medium">{{ active ? selectedLabel : label }}</span>
  </div>

  <template v-if="active && !hideClearButton">
    <DesktopOnlyTooltip :content="t('common.actions.clear')">
      <Button
        variant="ghost"
        size="icon"
        class="size-6 shrink-0"
        :aria-label="t('common.actions.clear')"
        @click.stop="emit('clear')"
      >
        <XIcon class="text-muted-foreground size-4" />
      </Button>
    </DesktopOnlyTooltip>
  </template>
  <div v-else class="size-6 shrink-0 p-1">
    <ChevronDownIcon class="text-muted-foreground size-4" />
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { ChevronDownIcon, XIcon } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

/**
 * Shared inner content for the multi-select filter triggers (categories / payees /
 * accounts) so all three read identically: a single truncating label plus a trailing
 * affordance that is a clear button while a selection is active and a chevron while the
 * field sits at its wide-open default. The `leading` slot carries per-entity chrome —
 * e.g. the payee brand logo when exactly one payee is picked. Rendered as the children
 * of each field's own Popover/Combobox trigger element.
 */
defineProps<{
  /** True when the field has an active narrowing selection (vs. the "all" default). */
  active: boolean;
  /** Label shown at the wide-open default, e.g. "All categories". */
  label: string;
  /** Label shown while a selection is active, e.g. "3 categories selected". */
  selectedLabel: string;
  /** Suppress the built-in clear button for hosts that render their own remove control. */
  hideClearButton?: boolean;
}>();

const emit = defineEmits<{ clear: [] }>();

const { t } = useI18n();
</script>
