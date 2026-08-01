/**
 * Cost estimation for investment transactions extraction. Same math as
 * statement-parser's cost estimator — different prompt + different output
 * shape, but token counts come from the same tokeniser.
 */
import { AI_FEATURE, type StatementCostEstimate, type StatementFileType } from '@bt/shared/types';
import { describeMissingAiConfiguration, resolveAIConfiguration } from '@services/ai';
import { estimateModelCostUsd, getModelCostProfile } from '@services/ai/models-config';
import { estimateTokenCount } from '@services/import-export/statement-parser/text-extractor';

import { createTextExtractionPrompt, getSystemPrompt } from './extraction-prompt';

/** Average output tokens per parsed transaction row. CSV is dense — 9 columns,
 * mostly short numbers — so this is conservative. */
const TOKENS_PER_TRANSACTION = 40;
const MIN_TRANSACTIONS_PER_PAGE = 5;
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

export async function estimateInvestmentExtractionCost({
  userId,
  text,
  pageCount,
  fileType,
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
        // Estimation runs before extraction in the wizard, so this is the first message a
        // user with a down endpoint sees — it has to name the endpoint, not "add a key".
        message: await describeMissingAiConfiguration({ userId }),
      },
    };
  }

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

  const systemPrompt = getSystemPrompt();
  const systemPromptTokens = estimateTokenCount({ text: systemPrompt });
  const userPromptTokens = estimateTokenCount({ text: createTextExtractionPrompt({ text }) });
  const estimatedInputTokens = systemPromptTokens + userPromptTokens;

  const estimatedTransactions = pageCount * ((MIN_TRANSACTIONS_PER_PAGE + MAX_TRANSACTIONS_PER_PAGE) / 2);
  const estimatedOutputTokens = Math.ceil(estimatedTransactions * TOKENS_PER_TRANSACTION);

  const estimatedCostUsd = estimateModelCostUsd({
    profile: modelProfile,
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
  });

  // A custom endpoint never declares how much input its model takes, so there is no limit
  // to hold the file against and the estimate ships without one.
  let tokenLimit: StatementCostEstimate['tokenLimit'];

  if (!modelProfile.isCustom) {
    const maxInputTokens = Math.floor(modelProfile.contextWindow / 3);

    if (estimatedInputTokens > maxInputTokens) {
      return {
        success: false,
        error: {
          code: 'TOKEN_LIMIT_EXCEEDED',
          message: `File too large. Estimated ${estimatedInputTokens.toLocaleString()} tokens vs limit ${maxInputTokens.toLocaleString()} (model ${modelProfile.name}).`,
          details: `Split the upload into smaller files or use a model with a larger context window.`,
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
