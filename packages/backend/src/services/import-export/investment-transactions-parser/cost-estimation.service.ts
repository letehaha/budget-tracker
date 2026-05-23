/**
 * Cost estimation for investment transactions extraction. Same math as
 * statement-parser's cost estimator — different prompt + different output
 * shape, but token counts come from the same tokeniser.
 */
import { AI_FEATURE, type StatementCostEstimate, type StatementFileType } from '@bt/shared/types';
import { ASSET_CLASS } from '@bt/shared/types/investments';
import { resolveAIConfiguration } from '@services/ai';
import { getModelInfo } from '@services/ai/models-config';
import { estimateTokenCount } from '@services/import-export/statement-parser/text-extractor';

import { createTextExtractionPrompt, getSystemPrompt } from './extraction-prompt';

/** Average output tokens per parsed transaction row. CSV is dense — 9 columns,
 * mostly short numbers — so this is conservative. */
const TOKENS_PER_TRANSACTION = 40;
const MIN_TRANSACTIONS_PER_PAGE = 5;
const MAX_TRANSACTIONS_PER_PAGE = 30;
const DEFAULT_CONTEXT_WINDOW = 100_000;

interface CostEstimationParams {
  userId: number;
  text: string;
  pageCount: number;
  fileType: StatementFileType;
  assetClass: ASSET_CLASS;
}

interface CostEstimationError {
  code: 'NO_AI_CONFIGURED' | 'TOKEN_LIMIT_EXCEEDED';
  message: string;
  details?: string;
}

type CostEstimationResultType =
  | { success: true; estimate: StatementCostEstimate }
  | { success: false; error: CostEstimationError };

export async function estimateInvestmentExtractionCost({
  userId,
  text,
  pageCount,
  fileType,
  assetClass,
}: CostEstimationParams): Promise<CostEstimationResultType> {
  const aiConfig = await resolveAIConfiguration({
    userId,
    feature: AI_FEATURE.investmentTransactionsParsing,
  });

  if (!aiConfig) {
    return {
      success: false,
      error: {
        code: 'NO_AI_CONFIGURED',
        message: 'No AI provider configured. Please add an API key in settings.',
      },
    };
  }

  const modelInfo = getModelInfo({ modelId: aiConfig.modelId });
  if (!modelInfo) {
    return {
      success: false,
      error: {
        code: 'NO_AI_CONFIGURED',
        message: `Model ${aiConfig.modelId} not found in configuration`,
      },
    };
  }

  const systemPrompt = getSystemPrompt({ assetClass });
  const systemPromptTokens = estimateTokenCount({ text: systemPrompt });
  const userPromptTokens = estimateTokenCount({ text: createTextExtractionPrompt({ text }) });
  const estimatedInputTokens = systemPromptTokens + userPromptTokens;

  const estimatedTransactions = pageCount * ((MIN_TRANSACTIONS_PER_PAGE + MAX_TRANSACTIONS_PER_PAGE) / 2);
  const estimatedOutputTokens = Math.ceil(estimatedTransactions * TOKENS_PER_TRANSACTION);

  const contextWindow = modelInfo.contextWindow || DEFAULT_CONTEXT_WINDOW;
  const maxInputTokens = Math.floor(contextWindow / 3);
  const exceedsLimit = estimatedInputTokens > maxInputTokens;

  let estimatedCostUsd = 0;
  if (modelInfo.pricing) {
    const inputCost = (estimatedInputTokens / 1_000_000) * modelInfo.pricing.inputPerMillion;
    const outputCost = (estimatedOutputTokens / 1_000_000) * modelInfo.pricing.outputPerMillion;
    estimatedCostUsd = inputCost + outputCost;
  }

  if (exceedsLimit) {
    return {
      success: false,
      error: {
        code: 'TOKEN_LIMIT_EXCEEDED',
        message: `File too large. Estimated ${estimatedInputTokens.toLocaleString()} tokens vs limit ${maxInputTokens.toLocaleString()} (model ${modelInfo.name}).`,
        details: `Split the upload into smaller files or use a model with a larger context window.`,
      },
    };
  }

  return {
    success: true,
    estimate: {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd,
      modelId: aiConfig.modelId,
      modelName: modelInfo.name,
      usingUserKey: aiConfig.usingUserKey,
      textExtraction: {
        success: true,
        characterCount: text.length,
        pageCount,
      },
      fileType,
      tokenLimit: {
        maxInputTokens,
        exceedsLimit,
      },
    },
  };
}
