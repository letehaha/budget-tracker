<script lang="ts">
import type { LucideIcon } from '@lucide/vue';

export interface QuickAction {
  /** Leading icon. */
  icon: LucideIcon;
  /** Action name — shown on the wide button and the overflow menu item. */
  label: string;
  /** Hover explanation for the wide inline buttons (desktop only). */
  tooltip: string;
  /** Invoked when the action is chosen (button click or menu select). */
  onClick: () => void;
}
</script>

<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/common/dropdown-menu';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { EllipsisVerticalIcon } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

/**
 * Resolve Values quick-action toolbar. Once the wizard container is wide enough
 * (`@2xl/csv-wizard`) it shows inline labelled buttons, each with a hover tooltip.
 * Below that it collapses into a single overflow menu so every action keeps a
 * readable label on touch, where hover tooltips never fire.
 */
defineProps<{ actions: QuickAction[] }>();

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Wide: inline labelled buttons -->
    <div class="hidden flex-wrap items-center gap-2 @2xl/csv-wizard:flex">
      <DesktopOnlyTooltip
        v-for="action in actions"
        :key="action.label"
        content-class-name="max-w-70"
        :content="action.tooltip"
      >
        <UiButton variant="secondary" size="sm" @click="action.onClick">
          <component :is="action.icon" class="size-3.5" />
          {{ action.label }}
        </UiButton>
      </DesktopOnlyTooltip>
    </div>

    <!-- Narrow: overflow menu (labels stay visible) -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <UiButton
          variant="secondary"
          size="sm"
          class="@2xl/csv-wizard:hidden"
          :aria-label="t('pages.importExport.resolveValues.quickActions.menuLabel')"
        >
          <EllipsisVerticalIcon class="size-4" />
        </UiButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-56">
        <DropdownMenuItem v-for="action in actions" :key="action.label" @select="action.onClick">
          <component :is="action.icon" class="size-4" />
          {{ action.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
