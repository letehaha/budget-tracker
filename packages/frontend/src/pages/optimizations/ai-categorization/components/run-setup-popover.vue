<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { ROUTES_NAMES } from '@/routes';
import { AI_FEATURE } from '@bt/shared/types';
import { BrainIcon, GaugeIcon, Loader2Icon, ServerIcon, SettingsIcon, TriangleAlertIcon } from '@lucide/vue';
import { computed } from 'vue';

const { getFeatureStatus, isFeaturesPending, featuresUnknown, isRefetchingFeatures, refetchFeatures } = useAiSettings();

const featureStatus = computed(() => getFeatureStatus(AI_FEATURE.categorization));

// "Not configured" is only true once the request has actually answered. A paused
// or offline query has no answer yet, and must read as loading, not as an error.
const hasSetupProblem = computed(() => featuresUnknown.value || (!isFeaturesPending.value && !featureStatus.value));
</script>

<template>
  <Popover>
    <!-- Trigger outside the tooltip: a PopoverTrigger nested inside would anchor
         the content to the tooltip rather than the button. -->
    <PopoverTrigger as-child>
      <span class="inline-flex max-w-44 shrink-0">
        <DesktopOnlyTooltip :content="$t('optimizations.aiCategorization.setup.title')">
          <Button variant="ghost" size="sm" class="max-w-full">
            <TriangleAlertIcon v-if="hasSetupProblem" class="text-destructive-text size-4 shrink-0" />
            <BrainIcon v-else class="text-muted-foreground size-4 shrink-0" />

            <!-- The problem label stays visible at every width: an error that degrades
                 to a bare icon is unreadable. -->
            <span v-if="hasSetupProblem" class="text-destructive-text truncate font-normal">
              {{ $t('optimizations.aiCategorization.setup.errorChip') }}
            </span>
            <span v-else-if="isFeaturesPending" class="bg-muted h-4 w-24 animate-pulse rounded @max-md/runbar:hidden" />
            <span v-else class="text-muted-foreground truncate font-normal @max-md/runbar:hidden">
              {{ featureStatus?.modelName }}
            </span>

            <!-- Trails the visible label so the accessible name reads
                 "AI setup problem, Run setup" instead of replacing the state. -->
            <span class="sr-only">{{ $t('optimizations.aiCategorization.setup.title') }}</span>
          </Button>
        </DesktopOnlyTooltip>
      </span>
    </PopoverTrigger>

    <PopoverContent align="end" class="flex w-76 flex-col gap-4">
      <p class="text-muted-foreground text-xs">
        {{ $t('optimizations.aiCategorization.description') }}
      </p>

      <div v-if="isFeaturesPending" class="flex flex-col gap-3">
        <div class="bg-muted h-5 w-3/4 animate-pulse rounded" />
        <div class="bg-muted h-5 w-1/2 animate-pulse rounded" />
      </div>

      <div v-else-if="hasSetupProblem" class="flex items-start gap-3">
        <TriangleAlertIcon class="text-destructive-text mt-0.5 size-4 shrink-0" />
        <div class="min-w-0">
          <p class="text-destructive-text text-sm">
            {{
              featuresUnknown
                ? $t('optimizations.aiCategorization.setup.loadError')
                : $t('optimizations.aiCategorization.setup.notConfigured')
            }}
          </p>
          <Button
            v-if="featuresUnknown"
            variant="outline"
            size="sm"
            class="mt-2"
            :disabled="isRefetchingFeatures"
            @click="refetchFeatures()"
          >
            <Loader2Icon v-if="isRefetchingFeatures" class="size-3.5 animate-spin" />
            {{ $t('common.actions.retry') }}
          </Button>
        </div>
      </div>

      <dl v-else class="flex flex-col gap-3 text-sm">
        <div class="flex items-start gap-3">
          <BrainIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div class="min-w-0">
            <dt class="text-muted-foreground text-xs">{{ $t('optimizations.aiCategorization.setup.model') }}</dt>
            <dd class="font-medium">{{ featureStatus?.modelName }}</dd>
          </div>
        </div>

        <div v-if="featureStatus?.endpointName" class="flex items-start gap-3">
          <ServerIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div class="min-w-0">
            <dt class="text-muted-foreground text-xs">{{ $t('optimizations.aiCategorization.setup.endpoint') }}</dt>
            <dd class="truncate font-medium">{{ featureStatus.endpointName }}</dd>
          </div>
        </div>

        <div class="flex items-start gap-3">
          <GaugeIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div class="min-w-0">
            <dt class="text-muted-foreground text-xs">{{ $t('optimizations.aiCategorization.setup.limits') }}</dt>
            <dd class="font-medium">
              {{
                featureStatus?.usingUserKey
                  ? $t('optimizations.aiCategorization.setup.limitsOwnCredentials')
                  : $t('optimizations.aiCategorization.setup.limitsSharedKey')
              }}
            </dd>
          </div>
        </div>
      </dl>

      <RouterLink
        :to="{ name: ROUTES_NAMES.settingsAiFeatures }"
        class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-sm transition-colors"
      >
        <SettingsIcon class="size-3.5" />
        {{ $t('optimizations.aiCategorization.setup.changeModel') }}
      </RouterLink>
    </PopoverContent>
  </Popover>
</template>
