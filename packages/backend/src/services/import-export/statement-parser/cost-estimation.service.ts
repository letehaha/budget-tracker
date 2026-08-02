/**
 * Cost estimation for statement extraction
 */
import type { StatementCostEstimate, StatementFileType } from '@bt/shared/types';
import { AI_FEATURE } from '@bt/shared/types';
import { estimateModelCostUsd } from '@services/ai/models-config';
import { resolveEstimationPrelude, resolveTokenLimit } from '@services/import-export/core/cost-estimation';

import { STATEMENT_EXTRACTION_SYSTEM_PROMPT, createTextExtractionPrompt } from './extraction-prompt';
import { estimateTokenCount } from './text-extractor';

/** Average output tokens per transaction (estimated) */
const TOKENS_PER_TRANSACTION = 50;

/** Estimated minimum transactions per page */
const MIN_TRANSACTIONS_PER_PAGE = 5;

/** Estimated maximum transactions per page */
const MAX_TRANSACTIONS_PER_PAGE = 30;

interface CostEstimationParams {
  userId: number;
  text: string;
  pageCount: number;
  fileType: StatementFileType;
}

interface CostEstimationError {
  code: 'NO_AI_CONFIGURED' | 'TOKEN_LIMIT_EXCEEDED';
  message: string;
  details?: string;
}

type CostEstimationResultType =
  | { success: true; estimate: StatementCostEstimate }
  | { success: false; error: CostEstimationError };

/**
 * Estimate the cost of extracting transactions from a statement file
 */
export async function estimateExtractionCost({
  userId,
  text,
  pageCount,
  fileType,
}: CostEstimationParams): Promise<CostEstimationResultType> {
  const prelude = await resolveEstimationPrelude({ userId, feature: AI_FEATURE.statementParsing });

  if (!prelude.ok) {
    return { success: false, error: prelude.error };
  }

  const { aiConfig, modelProfile } = prelude;

  // Estimate input tokens (system prompt + user prompt with statement text)
  const systemPromptTokens = estimateTokenCount({ text: STATEMENT_EXTRACTION_SYSTEM_PROMPT });
  const userPromptTokens = estimateTokenCount({ text: createTextExtractionPrompt({ text }) });
  const estimatedInputTokens = systemPromptTokens + userPromptTokens;

  // Estimate output tokens based on expected number of transactions
  // Conservative estimate: 15 transactions per page on average
  const estimatedTransactions = pageCount * ((MIN_TRANSACTIONS_PER_PAGE + MAX_TRANSACTIONS_PER_PAGE) / 2);
  const metadataTokens = 100; // For metadata CSV structure
  const estimatedOutputTokens = estimatedTransactions * TOKENS_PER_TRANSACTION + metadataTokens;

  const tokenLimit = resolveTokenLimit({ modelProfile, estimatedInputTokens });

  if (tokenLimit.exceeded) {
    return {
      success: false,
      error: {
        code: 'TOKEN_LIMIT_EXCEEDED',
        message: `File is too large for the selected model. Estimated ${estimatedInputTokens.toLocaleString()} tokens, but the limit is ${tokenLimit.maxInputTokens.toLocaleString()} tokens (${tokenLimit.modelName} context: ${tokenLimit.contextWindow.toLocaleString()}).`,
        details: `Please use a smaller file or split your statement into multiple parts. Recommended: statements with up to ~${Math.floor(tokenLimit.maxInputTokens / 100)} transactions.`,
      },
    };
  }

  return {
    success: true,
    estimate: {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd: estimateModelCostUsd({
        profile: modelProfile,
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
      }),
      modelId: aiConfig.modelId,
      modelName: modelProfile.name,
      usingUserKey: aiConfig.usingUserKey,
      textExtraction: {
        success: true,
        characterCount: text.length,
        pageCount,
      },
      fileType,
    },
  };
}
