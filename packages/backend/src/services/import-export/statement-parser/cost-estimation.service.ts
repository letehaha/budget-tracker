/**
 * Cost estimation for statement extraction
 */
import type { StatementCostEstimate, StatementFileType } from '@bt/shared/types';
import { AI_FEATURE } from '@bt/shared/types';
import { describeMissingAiConfiguration, resolveAIConfiguration } from '@services/ai';
import { estimateModelCostUsd, getModelCostProfile } from '@services/ai/models-config';

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
  // Get AI configuration to determine which model will be used
  const aiConfig = await resolveAIConfiguration({
    userId,
    feature: AI_FEATURE.statementParsing,
  });

  if (!aiConfig) {
    return {
      success: false,
      error: {
        code: 'NO_AI_CONFIGURED',
        // Estimation runs before extraction in the wizard, so this is the first message a
        // user with a down endpoint sees — it has to name the endpoint, not "add a key".
        message: await describeMissingAiConfiguration({ userId }),
      },
    };
  }

  // Get model info for pricing and context window
  const modelProfile = getModelCostProfile({ modelId: aiConfig.modelId });

  if (!modelProfile) {
    return {
      success: false,
      error: {
        code: 'NO_AI_CONFIGURED',
        message: `Model ${aiConfig.modelId} not found in configuration`,
      },
    };
  }

  // Estimate input tokens (system prompt + user prompt with statement text)
  const systemPromptTokens = estimateTokenCount({ text: STATEMENT_EXTRACTION_SYSTEM_PROMPT });
  const userPromptTokens = estimateTokenCount({ text: createTextExtractionPrompt({ text }) });
  const estimatedInputTokens = systemPromptTokens + userPromptTokens;

  // Estimate output tokens based on expected number of transactions
  // Conservative estimate: 15 transactions per page on average
  const estimatedTransactions = pageCount * ((MIN_TRANSACTIONS_PER_PAGE + MAX_TRANSACTIONS_PER_PAGE) / 2);
  const metadataTokens = 100; // For metadata CSV structure
  const estimatedOutputTokens = estimatedTransactions * TOKENS_PER_TRANSACTION + metadataTokens;

  const estimatedCostUsd = estimateModelCostUsd({
    profile: modelProfile,
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
  });

  // A custom endpoint never declares how much input its model takes, so there is no limit
  // to hold the file against and the estimate ships without one.
  let tokenLimit: StatementCostEstimate['tokenLimit'];

  if (!modelProfile.isCustom) {
    // Calculate token limit (model context / 3)
    const maxInputTokens = Math.floor(modelProfile.contextWindow / 3);

    // Return error if file exceeds token limit
    if (estimatedInputTokens > maxInputTokens) {
      return {
        success: false,
        error: {
          code: 'TOKEN_LIMIT_EXCEEDED',
          message: `File is too large for the selected model. Estimated ${estimatedInputTokens.toLocaleString()} tokens, but the limit is ${maxInputTokens.toLocaleString()} tokens (${modelProfile.name} context: ${modelProfile.contextWindow.toLocaleString()}).`,
          details: `Please use a smaller file or split your statement into multiple parts. Recommended: statements with up to ~${Math.floor(maxInputTokens / 100)} transactions.`,
        },
      };
    }

    tokenLimit = { maxInputTokens, exceedsLimit: false };
  }

  return {
    success: true,
    estimate: {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd,
      modelId: aiConfig.modelId,
      modelName: modelProfile.name,
      usingUserKey: aiConfig.usingUserKey,
      textExtraction: {
        success: true,
        characterCount: text.length,
        pageCount,
      },
      fileType,
      tokenLimit,
    },
  };
}
