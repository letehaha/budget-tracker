<template>
  <div class="space-y-4">
    <!-- Token-based processing time warning -->
    <div
      v-if="tokenWarningLevel"
      class="flex items-start gap-3 rounded-lg p-3"
      :class="{
        'bg-warning/10 text-warning-foreground': tokenWarningLevel === 'medium',
        'bg-destructive/10 text-destructive-text': tokenWarningLevel === 'high' || tokenWarningLevel === 'extreme',
      }"
    >
      <AlertTriangleIcon class="mt-0.5 size-5 shrink-0" />
      <div class="space-y-1">
        <p class="text-sm font-medium">{{ tokenWarningTitle }}</p>
        <p class="text-sm opacity-90">{{ tokenWarningDescription }}</p>
      </div>
    </div>

    <!-- Free API access warning -->
    <div v-if="!usingUserKey" class="bg-muted/50 flex items-start gap-3 rounded-lg border p-3">
      <InfoIcon class="text-warning-text mt-0.5 size-5 shrink-0" />
      <div class="space-y-1">
        <p class="text-warning-text text-sm">
          {{ $t('pages.statementParser.uploadExtract.freeApiWarning') }}
        </p>
        <router-link :to="{ name: ROUTES_NAMES.settingsAiKeys }" class="text-primary text-sm hover:underline">
          {{ $t('pages.statementParser.uploadExtract.addApiKeyLink') }}
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ROUTES_NAMES } from '@/routes';
import { AlertTriangleIcon, InfoIcon } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  estimatedInputTokens: number;
  usingUserKey: boolean;
}>();

const { t } = useI18n();

// Token warning thresholds (input tokens)
const TOKEN_THRESHOLDS = {
  MEDIUM: 30_000,
  HIGH: 60_000,
  EXTREME: 100_000,
} as const;

type TokenWarningLevel = 'medium' | 'high' | 'extreme' | null;

const tokenWarningLevel = computed<TokenWarningLevel>(() => {
  const tokens = props.estimatedInputTokens;

  if (tokens >= TOKEN_THRESHOLDS.EXTREME) return 'extreme';
  if (tokens >= TOKEN_THRESHOLDS.HIGH) return 'high';
  if (tokens >= TOKEN_THRESHOLDS.MEDIUM) return 'medium';
  return null;
});

const tokenWarningTitle = computed(() => {
  switch (tokenWarningLevel.value) {
    case 'extreme':
      return t('pages.statementParser.uploadExtract.tokenWarning.extreme.title');
    case 'high':
      return t('pages.statementParser.uploadExtract.tokenWarning.high.title');
    case 'medium':
      return t('pages.statementParser.uploadExtract.tokenWarning.medium.title');
    default:
      return '';
  }
});

const tokenWarningDescription = computed(() => {
  switch (tokenWarningLevel.value) {
    case 'extreme':
      return t('pages.statementParser.uploadExtract.tokenWarning.extreme.description');
    case 'high':
      return t('pages.statementParser.uploadExtract.tokenWarning.high.description');
    case 'medium':
      return t('pages.statementParser.uploadExtract.tokenWarning.medium.description');
    default:
      return '';
  }
});

const hasWarnings = computed(() => tokenWarningLevel.value !== null || !props.usingUserKey);

defineExpose({ hasWarnings });
</script>
