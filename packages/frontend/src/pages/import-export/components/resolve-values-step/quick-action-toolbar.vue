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
  /** Disables the action in both the inline button and the overflow menu. */
  disabled?: boolean;
  /** Moves the action into the shared "Actions" dropdown instead of the inline row. */
  menu?: boolean;
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
import { ChevronDownIcon, EllipsisVerticalIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Resolve Values quick-action toolbar. Once the wizard container is wide enough
 * (`@2xl/csv-wizard`) it shows a single "Actions" dropdown holding every action
 * flagged `menu`, followed by the remaining actions as inline labelled buttons
 * with hover tooltips. Below that it collapses into a single overflow menu so
 * every action keeps a readable label on touch, where hover tooltips never fire.
 */
const props = defineProps<{ actions: QuickAction[] }>();

const { t } = useI18n();

const menuActions = computed(() => props.actions.filter((action) => action.menu));
const inlineActions = computed(() => props.actions.filter((action) => !action.menu));
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Wide: "Actions" dropdown + inline labelled buttons -->
    <div class="hidden flex-wrap items-center gap-2 @2xl/csv-wizard:flex">
      <DropdownMenu v-if="menuActions.length > 0">
        <DropdownMenuTrigger as-child>
          <UiButton variant="secondary" size="sm">
            {{ t('importShared.quickActions.menu') }}
            <ChevronDownIcon class="size-3.5" />
          </UiButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-56">
          <DropdownMenuItem
            v-for="action in menuActions"
            :key="action.label"
            :disabled="action.disabled"
            :title="action.tooltip"
            @select="action.onClick"
          >
            <component :is="action.icon" class="size-4" />
            {{ action.label }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DesktopOnlyTooltip
        v-for="action in inlineActions"
        :key="action.label"
        content-class-name="max-w-70"
        :content="action.tooltip"
      >
        <UiButton variant="secondary" size="sm" :disabled="action.disabled" @click="action.onClick">
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
          :aria-label="t('importShared.quickActionsMenuLabel')"
        >
          <EllipsisVerticalIcon class="size-4" />
        </UiButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-56">
        <DropdownMenuItem
          v-for="action in actions"
          :key="action.label"
          :disabled="action.disabled"
          @select="action.onClick"
        >
          <component :is="action.icon" class="size-4" />
          {{ action.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
