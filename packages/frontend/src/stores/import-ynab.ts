import { executeYnabImport, getYnabImportStatus, parseYnab } from '@/api/import-ynab';
import { useImportJobProgress } from '@/composable/use-import-job-progress';
import { useAccountsStore } from '@/stores/accounts';
import { useCategoriesStore } from '@/stores/categories/categories';
import { useCurrenciesStore } from '@/stores/currencies';
import { useTagsStore } from '@/stores/tags';
import {
  SSE_EVENT_TYPES,
  type YnabAccountMapping,
  type YnabImportProgress,
  type YnabParseResult,
} from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/** Linear wizard step:
 * 1 — file upload
 * 2 — preview + per-account currency picker
 * 3 — execute + progress
 * 4 — done (summary screen)
 */
export type YnabImportStep = 1 | 2 | 3 | 4;

export const useImportYnabStore = defineStore('importYnab', () => {
  const queryClient = useQueryClient();

  const uploadedFile = ref<File | null>(null);
  const parsedResult = ref<YnabParseResult | null>(null);

  /** Keyed by `YnabParseAccount.originalName`. */
  const accountPicks = ref<YnabAccountMapping>({});

  const currentStep = ref<YnabImportStep>(1);

  /**
   * SSE + status-poll watchdog for the running import. Owns the live `progress`
   * and the terminal `executeError`. On success the wizard advances to the done
   * screen; lost contact bounces back to the picker step so the user can retry.
   */
  const jobProgress = useImportJobProgress<YnabImportProgress>({
    sseEventType: SSE_EVENT_TYPES.YNAB_IMPORT_PROGRESS,
    fetchStatus: getYnabImportStatus,
    onComplete: async () => {
      currentStep.value = 4;
      // Invalidate every cached TanStack query so transactions/payees/budgets etc.
      // pick up the just-imported rows.
      queryClient.invalidateQueries();
      // Pinia-backed lists (accounts, categories, tags, currencies) are not
      // wired into TanStack — refetch each one explicitly so sidebars and
      // pickers don't keep their pre-import snapshot.
      await Promise.allSettled([
        useAccountsStore().refetchAccounts(),
        useCategoriesStore().loadCategories(),
        useTagsStore().loadTags(),
        useCurrenciesStore().loadCurrencies(),
      ]);
    },
    // On failure the wizard stays on the execute step, where the failed status
    // callout (with the server's error message) is rendered.
    onFailure: () => {},
    onLostContact: () => {
      currentStep.value = 2;
    },
  });
  const progress = jobProgress.progress;
  /** Terminal watchdog error (lost contact / expired job) for the execute step. */
  const executeError = jobProgress.executeError;

  const isParsing = ref(false);
  const parseError = ref<string | null>(null);

  // Internal execute machinery — components never read these.
  let fileContent: string | null = null;

  const canExecute = computed(() => {
    if (!parsedResult.value) return false;
    // Every YNAB account must have resolved to a valid 3-letter ISO currency
    // code before the worker can boot user currencies and create the row.
    for (const acc of parsedResult.value.accounts) {
      const mapping = accountPicks.value[acc.originalName];
      if (!mapping || mapping.currencyCode.length !== 3) return false;
    }
    return true;
  });

  async function parseFile(file: File) {
    uploadedFile.value = file;
    fileContent = await file.text();
    isParsing.value = true;
    parseError.value = null;
    try {
      const { result } = await parseYnab({ fileContent });
      parsedResult.value = result;
      // Seed account picks with the parser's currency guesses so the user
      // only has to overrule misses, not type every currency from scratch.
      const seeded: YnabAccountMapping = {};
      for (const acc of result.accounts) {
        seeded[acc.originalName] = { currencyCode: acc.detectedCurrency ?? '' };
      }
      accountPicks.value = seeded;
      currentStep.value = 2;
    } catch (err) {
      parseError.value = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      isParsing.value = false;
    }
  }

  async function execute() {
    if (!fileContent || !canExecute.value) return;
    executeError.value = null;

    let response: Awaited<ReturnType<typeof executeYnabImport>>;
    try {
      response = await executeYnabImport({
        fileContent,
        accountMapping: accountPicks.value,
      });
    } catch (err) {
      // The call never started the job — keep the user on the picker step (2)
      // so they can correct the input and retry.
      executeError.value = err instanceof Error ? err.message : 'Unknown error';
      return;
    }

    // Job accepted: only now advance to the progress step and arm the watchdog.
    currentStep.value = 3;
    jobProgress.start({
      initialProgress: {
        jobId: response.jobId,
        status: 'queued',
        processedCount: 0,
        totalCount: 0,
      },
    });
  }

  function reset() {
    uploadedFile.value = null;
    parsedResult.value = null;
    accountPicks.value = {};
    progress.value = null;
    currentStep.value = 1;
    isParsing.value = false;
    parseError.value = null;
    executeError.value = null;
    fileContent = null;
    jobProgress.stop();
  }

  return {
    uploadedFile,
    parsedResult,
    accountPicks,
    progress,
    currentStep,
    isParsing,
    parseError,
    executeError,
    canExecute,
    parseFile,
    execute,
    reset,
  };
});
