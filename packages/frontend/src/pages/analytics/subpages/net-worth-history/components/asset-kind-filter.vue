<template>
  <div v-if="kinds.length > 0" class="w-[190px] max-w-full">
    <MultiSelectField
      v-model:open="isOpen"
      :active="isNarrowed"
      :label="$t('netWorthHistory.assetFilter.all')"
      :selected-label="selectedLabel"
      :searchable="false"
      content-class="w-64"
      @clear="clearSelection"
    >
      <div class="border-border/60 text-muted-foreground border-b px-3 py-2 text-xs">
        {{ $t('netWorthHistory.assetFilter.scopeHint') }}
      </div>

      <div class="p-2">
        <div
          v-for="kind in kinds"
          :key="kind"
          role="option"
          :aria-selected="isChecked(kind)"
          :class="
            cn(
              'hover:bg-accent flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5',
              isChecked(kind) && 'bg-primary/5',
            )
          "
          @click="toggleKind(kind)"
        >
          <Checkbox :model-value="isChecked(kind)" @click.stop @update:model-value="toggleKind(kind)" />
          <span
            class="size-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: NET_WORTH_ASSET_KIND_COLORS[kind] }"
          />
          <span class="min-w-0 flex-1 truncate text-sm">{{ $t(NET_WORTH_ASSET_KIND_LABEL_KEYS[kind]) }}</span>
        </div>
      </div>
    </MultiSelectField>
  </div>
</template>

<script setup lang="ts">
import MultiSelectField from '@/components/fields/multi-select-field.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { cn } from '@/lib/utils';
import type { endpointsTypes } from '@bt/shared/types';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  NET_WORTH_ASSET_KIND_COLORS,
  NET_WORTH_ASSET_KIND_LABEL_KEYS,
  resolveSelectedKinds,
} from '../composables/net-worth-history-derivations';

/**
 * Asset-kind filter for the Net Worth History report. Purely client-side:
 * toggling kinds reshapes the already-loaded series, it never refetches.
 *
 * `modelValue` is the set of INCLUDED kinds. An EMPTY array is the load-bearing
 * "all kinds" default. Only kinds with activity in the loaded series are offered
 * (`kinds`), so the filter only lists asset classes the user actually holds.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: endpointsTypes.NetWorthAssetKind[];
    // Kinds with a nonzero balance anywhere in the loaded series, in display order.
    kinds: endpointsTypes.NetWorthAssetKind[];
  }>(),
  {
    modelValue: () => [],
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: endpointsTypes.NetWorthAssetKind[]];
}>();

const { t } = useI18n();

const isOpen = ref(false);

// Shares resolveSelectedKinds with the chart so the filter's checked state
// always matches what actually renders.
const includedKinds = computed<Set<endpointsTypes.NetWorthAssetKind>>(
  () => new Set(resolveSelectedKinds({ stored: props.modelValue ?? [], available: props.kinds })),
);

const selectedCount = computed(() => includedKinds.value.size);

// Narrowed only when a strict subset is included; "all included" and "none stored"
// both read as the wide-open default.
const isNarrowed = computed(() => selectedCount.value > 0 && selectedCount.value < props.kinds.length);

const isChecked = (kind: endpointsTypes.NetWorthAssetKind) => includedKinds.value.has(kind);

const selectedLabel = computed(() =>
  selectedCount.value === 1
    ? t('netWorthHistory.assetFilter.selectedOne')
    : t('netWorthHistory.assetFilter.selectedMany', { n: selectedCount.value }),
);

const toggleKind = (kind: endpointsTypes.NetWorthAssetKind) => {
  const next = new Set(includedKinds.value);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);

  // Collapse "everything included" and "nothing left" back to the empty "all"
  // sentinel — there is no distinct "no kinds" state, empty always means all.
  if (next.size === 0 || next.size === props.kinds.length) {
    emit('update:modelValue', []);
    return;
  }

  emit('update:modelValue', [...next]);
};

const clearSelection = () => emit('update:modelValue', []);
</script>
