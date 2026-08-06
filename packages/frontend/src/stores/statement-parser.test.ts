import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

import { useStatementParserStore } from './statement-parser';

// ----- module mocks -----

vi.mock('@/api/import-export', () => ({
  estimateStatementCost: vi.fn(),
  extractStatementTransactions: vi.fn(),
  detectStatementDuplicates: vi.fn(),
  executeStatementImport: vi.fn(),
}));

vi.mock('@/api/transactions', () => ({ loadTransactions: vi.fn() }));

vi.mock('@/lib/posthog', () => ({ trackAnalyticsEvent: vi.fn() }));

// useQueryClient is called at store construction time; hand back a shared client.
let sharedQueryClient: QueryClient;
vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>();
  return { ...actual, useQueryClient: vi.fn(() => sharedQueryClient) };
});

vi.mock('./onboarding', () => ({ useOnboardingStore: vi.fn(() => ({ completeTask: vi.fn() })) }));

// ----- helpers -----

import * as statementApi from '@/api/import-export';
import type { StatementCostEstimate, StatementExtractionResult } from '@bt/shared/types';

const mockEstimate = vi.mocked(statementApi.estimateStatementCost);
const mockExtract = vi.mocked(statementApi.extractStatementTransactions);

const COST_ESTIMATE: StatementCostEstimate = {
  estimatedInputTokens: 1000,
  estimatedOutputTokens: 500,
  estimatedCostUsd: 0.01,
  modelId: 'model-1',
  modelName: 'Model One',
  usingUserKey: false,
  textExtraction: { success: true, characterCount: 400, pageCount: 1 },
  fileType: 'pdf',
};

const PASSWORD_FAILURE = {
  success: false as const,
  textExtraction: { success: false as const, characterCount: 0, pageCount: 1, errorCode: 'PASSWORD_REQUIRED' as const },
  fileType: 'pdf' as const,
  suggestion: 'This PDF is password-protected.',
};

const EXTRACTION_RESULT: StatementExtractionResult = {
  transactions: [{ date: '2026-01-01', description: 'Coffee', amount: 3.5, type: 'expense' }],
  metadata: {},
  pageCount: 1,
  fileType: 'pdf',
  tokenCount: { input: 1000, output: 500 },
  droppedRowCount: 0,
};

const aPdf = (name = 'statement.pdf') => new File(['%PDF-1.4 fake'], name, { type: 'application/pdf' });

/** Mount a minimal component so Pinia + VueQuery plugins are active. */
const mountWithPlugins = () => {
  sharedQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pinia = createPinia();
  setActivePinia(pinia);
  const Wrapper = defineComponent({ setup() {}, template: '<div />' });
  mount(Wrapper, { global: { plugins: [pinia, [VueQueryPlugin, { queryClient: sharedQueryClient }]] } });
};

/** Password the last estimate/extract request carried, `undefined` when none. */
const lastEstimatePassword = () => mockEstimate.mock.lastCall?.[0].password;
const lastExtractPassword = () => mockExtract.mock.lastCall?.[0].password;

// ----- tests -----

describe('useStatementParserStore – document password + per-file state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('drops the estimate of the previous file when a new file is picked', async () => {
    const store = useStatementParserStore();
    mockEstimate.mockResolvedValue(COST_ESTIMATE);
    await store.setFile({ file: aPdf() });
    await store.estimateCost();
    expect(store.costEstimate).not.toBeNull();

    await store.setFile({ file: aPdf('other.pdf') });

    expect(store.costEstimate).toBeNull();
  });

  it('drops the extraction result and error of the previous file when a new file is picked', async () => {
    const store = useStatementParserStore();
    mockExtract.mockResolvedValue(EXTRACTION_RESULT);
    await store.setFile({ file: aPdf() });
    await store.extract();
    expect(store.extractionResult).not.toBeNull();

    await store.setFile({ file: aPdf('other.pdf') });

    expect(store.extractionResult).toBeNull();
    expect(store.extractionError).toBeNull();
  });

  it('drops the error and password of the previous file when a new file is picked', async () => {
    const store = useStatementParserStore();
    mockEstimate.mockResolvedValue(PASSWORD_FAILURE);
    await store.setFile({ file: aPdf() });
    await store.estimateCost();
    store.setDocumentPassword({ password: 'hunter2' });

    await store.setFile({ file: aPdf('other.pdf') });

    expect(store.estimateError).toBeNull();
    expect(store.estimateErrorCode).toBeNull();

    mockEstimate.mockResolvedValue(COST_ESTIMATE);
    await store.estimateCost();
    expect(lastEstimatePassword()).toBeUndefined();
  });

  it('surfaces the text-extraction error code from a failed estimate', async () => {
    const store = useStatementParserStore();
    mockEstimate.mockResolvedValue(PASSWORD_FAILURE);
    await store.setFile({ file: aPdf() });

    await store.estimateCost();

    expect(store.estimateErrorCode).toBe('PASSWORD_REQUIRED');
    expect(store.estimateError).toBe(PASSWORD_FAILURE.suggestion);
    expect(store.costEstimate).toBeNull();
  });

  it('sends the password set by setDocumentPassword on both estimate and extract', async () => {
    const store = useStatementParserStore();
    mockEstimate.mockResolvedValue(COST_ESTIMATE);
    mockExtract.mockResolvedValue(EXTRACTION_RESULT);
    await store.setFile({ file: aPdf() });
    store.setDocumentPassword({ password: 'hunter2' });

    await store.estimateCost();
    await store.extract();

    expect(lastEstimatePassword()).toBe('hunter2');
    expect(lastExtractPassword()).toBe('hunter2');
  });

  // The upload step stays reachable after a successful extraction, so a re-extract
  // must still carry the password the encrypted file needs.
  it('still sends the password on a second extract after a successful one', async () => {
    const store = useStatementParserStore();
    mockExtract.mockResolvedValue(EXTRACTION_RESULT);
    await store.setFile({ file: aPdf() });
    store.setDocumentPassword({ password: 'hunter2' });
    await store.extract();

    await store.extract();

    expect(mockExtract).toHaveBeenCalledTimes(2);
    expect(lastExtractPassword()).toBe('hunter2');
  });

  it('keeps the password when extraction fails so it can be retried', async () => {
    const store = useStatementParserStore();
    mockExtract.mockRejectedValue(new Error('AI is down'));
    await store.setFile({ file: aPdf() });
    store.setDocumentPassword({ password: 'hunter2' });

    await store.extract();
    await store.extract();

    expect(store.extractionError).toBe('AI is down');
    expect(lastExtractPassword()).toBe('hunter2');
  });

  it('clears the password and the error code on reset', async () => {
    const store = useStatementParserStore();
    mockEstimate.mockResolvedValue(PASSWORD_FAILURE);
    await store.setFile({ file: aPdf() });
    await store.estimateCost();
    store.setDocumentPassword({ password: 'hunter2' });

    store.reset();

    expect(store.estimateErrorCode).toBeNull();
    expect(store.estimateError).toBeNull();

    mockEstimate.mockResolvedValue(COST_ESTIMATE);
    await store.setFile({ file: aPdf() });
    await store.estimateCost();
    expect(lastEstimatePassword()).toBeUndefined();
  });
});
