<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import type { CashFlowExecuteResponse } from '@bt/shared/types';
import { CheckCircle2Icon, XCircleIcon } from 'lucide-vue-next';
import { computed } from 'vue';

const props = defineProps<{
  portfolioId: number;
  result: CashFlowExecuteResponse;
}>();

const emit = defineEmits<{
  (e: 'startOver'): void;
}>();

const hasErrors = computed(() => props.result.errors.length > 0);
</script>

<template>
  <div class="grid gap-6">
    <div class="flex items-center gap-3">
      <CheckCircle2Icon v-if="!hasErrors" class="text-app-income-color size-8" />
      <XCircleIcon v-else class="text-app-expense-color size-8" />
      <div>
        <h3 class="text-lg font-semibold">
          {{
            hasErrors
              ? $t('portfolioCashFlowImport.results.titleWithErrors')
              : $t('portfolioCashFlowImport.results.titleSuccess')
          }}
        </h3>
        <p class="text-muted-foreground text-sm">
          <i18n-t keypath="portfolioCashFlowImport.results.summary" tag="span">
            <template #count>
              <strong class="text-foreground">{{ result.imported }}</strong>
            </template>
          </i18n-t>
        </p>
      </div>
    </div>

    <div v-if="hasErrors" class="rounded-md border p-4">
      <h4 class="text-sm font-semibold">{{ $t('portfolioCashFlowImport.results.errorsTitle') }}</h4>
      <ul class="mt-2 grid gap-1 text-xs">
        <li v-for="err in result.errors" :key="err.rowIndex" class="text-muted-foreground">
          <i18n-t keypath="portfolioCashFlowImport.results.errorLine" tag="span">
            <template #row>
              <strong class="text-foreground">#{{ err.rowIndex + 1 }}</strong>
            </template>
            <template #message>
              {{ err.error }}
            </template>
          </i18n-t>
        </li>
      </ul>
    </div>

    <div class="flex items-center justify-end gap-3">
      <UiButton variant="ghost" @click="emit('startOver')">
        {{ $t('portfolioCashFlowImport.results.startOverButton') }}
      </UiButton>
      <RouterLink :to="{ name: ROUTES_NAMES.portfolioDetail, params: { portfolioId } }" class="inline-flex">
        <UiButton>
          {{ $t('portfolioCashFlowImport.results.backToPortfolioButton') }}
        </UiButton>
      </RouterLink>
    </div>
  </div>
</template>
