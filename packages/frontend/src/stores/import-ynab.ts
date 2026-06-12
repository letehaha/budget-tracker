import { executeYnabImport, getYnabImportStatus, parseYnab } from '@/api/import-ynab';
import { useSSE } from '@/composable/use-sse';
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

const STATUS_POLL_INTERVAL_MS = 2000;
/** SSE is the primary progress channel. The HTTP status poll only fires after
 *  the connection has been quiet for this long, so a dropped event or dead
 *  connection still converges to the job's terminal state. */
const SSE_STALL_THRESHOLD_MS = 10_000;
/** Bail out of the watchdog after this many consecutive `/status` failures so
 *  the user gets a real error instead of an infinite spinner when their
 *  session expired or the job rolled off the 24h retention window. */
const MAX_POLL_FAILURES = 5;

export const useImportYnabStore = defineStore('importYnab', () => {
  const queryClient = useQueryClient();
  const sse = useSSE();

  const uploadedFile = ref<File | null>(null);
  const parsedResult = ref<YnabParseResult | null>(null);

  /** Keyed by `YnabParseAccount.originalName`. */
  const accountPicks = ref<YnabAccountMapping>({});

  const progress = ref<YnabImportProgress | null>(null);

  const currentStep = ref<YnabImportStep>(1);
  const isParsing = ref(false);
  const parseError = ref<string | null>(null);
  const executeError = ref<string | null>(null);

  // Internal execute machinery — components never read these.
  let fileContent: string | null = null;
  let jobId: string | null = null;
  let lastSseEventAt = 0;
  let unsubscribeSse: (() => void) | null = null;
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let consecutivePollFailures = 0;

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
    currentStep.value = 3;

    try {
      const response = await executeYnabImport({
        fileContent,
        accountMapping: accountPicks.value,
      });
      jobId = response.jobId;
      progress.value = {
        jobId: response.jobId,
        status: 'queued',
        processedCount: 0,
        totalCount: 0,
      };
      lastSseEventAt = Date.now();

      // Hook up SSE for live updates.
      sse.connect().catch(() => {
        // SSE unavailable; the stall watchdog below takes over via polling.
      });
      unsubscribeSse?.();
      unsubscribeSse = sse.on(SSE_EVENT_TYPES.YNAB_IMPORT_PROGRESS, (data) => {
        const payload = data as YnabImportProgress;
        if (payload.jobId !== jobId) return;
        lastSseEventAt = Date.now();
        progress.value = payload;
        if (payload.status === 'completed' || payload.status === 'failed') {
          onTerminalStatus(payload.status);
        }
      });

      // Stall watchdog: hits the HTTP status endpoint only while SSE has gone
      // quiet, instead of polling unconditionally alongside a healthy stream.
      if (pollHandle) clearInterval(pollHandle);
      consecutivePollFailures = 0;
      pollHandle = setInterval(async () => {
        if (!jobId || Date.now() - lastSseEventAt < SSE_STALL_THRESHOLD_MS) return;
        try {
          const update = await getYnabImportStatus(jobId);
          consecutivePollFailures = 0;
          progress.value = update;
          if (update.status === 'completed' || update.status === 'failed') {
            onTerminalStatus(update.status);
          }
        } catch (err) {
          consecutivePollFailures += 1;
          if (consecutivePollFailures >= MAX_POLL_FAILURES) {
            // SSE gave up AND polling keeps failing — surface the error and
            // stop the watchdog so the user isn't stuck on a phantom spinner.
            executeError.value = err instanceof Error ? err.message : 'Lost contact with the import job.';
            stopProgressTracking();
            currentStep.value = 2;
          }
        }
      }, STATUS_POLL_INTERVAL_MS);
    } catch (err) {
      executeError.value = err instanceof Error ? err.message : 'Unknown error';
      currentStep.value = 2;
    }
  }

  function stopProgressTracking() {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    unsubscribeSse?.();
    unsubscribeSse = null;
    consecutivePollFailures = 0;
  }

  /** On failure the wizard stays on the execute step, where the failed status
   *  callout (with the server's error message) is rendered. */
  async function onTerminalStatus(status: 'completed' | 'failed') {
    stopProgressTracking();
    if (status !== 'completed') return;
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
    jobId = null;
    stopProgressTracking();
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
