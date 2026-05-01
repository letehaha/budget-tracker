/**
 * AI-powered extraction of portfolio cash-flow rows from raw text.
 *
 * Uses Vercel AI SDK's `generateObject` with a Zod schema so the model is
 * forced to return well-typed rows; manual JSON-string parsing isn't needed.
 */
import { AI_FEATURE } from '@bt/shared/types';
import type { CashFlowExtractionResult } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { createAIClient } from '@services/ai';
import { getModelInfo } from '@services/ai/models-config';
import { generateObject } from 'ai';

import {
  CASH_FLOW_EXTRACTION_SYSTEM_PROMPT,
  buildCashFlowUserPrompt,
  cashFlowExtractionSchema,
} from './extraction-prompt';

interface AIExtractionParams {
  userId: number;
  text: string;
  userHint?: string | null;
}

type AIExtractionErrorCode = 'NO_AI_CONFIGURED' | 'AI_ERROR' | 'NO_ROWS_FOUND' | 'RATE_LIMITED';

interface AIExtractionError {
  code: AIExtractionErrorCode;
  message: string;
  details?: string;
}

type AIExtractionResultType =
  | { success: true; result: CashFlowExtractionResult }
  | { success: false; error: AIExtractionError };

const LOG_PREFIX = '[CashFlowImport/ai]';

export async function extractCashFlowsWithAI({
  userId,
  text,
  userHint,
}: AIExtractionParams): Promise<AIExtractionResultType> {
  const clientStart = Date.now();
  const aiClient = await createAIClient({ userId, feature: AI_FEATURE.portfolioCashFlowImport });
  logger.info(
    `${LOG_PREFIX} resolved AI client userId=${userId} hasClient=${!!aiClient} usingUserKey=${aiClient?.usingUserKey ?? false} modelId=${aiClient?.modelId ?? 'n/a'} clientMs=${Date.now() - clientStart}`,
  );

  if (!aiClient) {
    return {
      success: false,
      error: {
        code: 'NO_AI_CONFIGURED',
        message: 'No AI provider configured. Please add an API key in settings.',
      },
    };
  }

  const prompt = buildCashFlowUserPrompt({ text, userHint });
  logger.info(
    `${LOG_PREFIX} calling generateObject userId=${userId} modelId=${aiClient.modelId} promptChars=${prompt.length}`,
  );
  const generateStart = Date.now();

  try {
    const { object, usage } = await generateObject({
      model: aiClient.model,
      schema: cashFlowExtractionSchema,
      system: CASH_FLOW_EXTRACTION_SYSTEM_PROMPT,
      prompt,
    });
    logger.info(
      `${LOG_PREFIX} generateObject completed userId=${userId} modelId=${aiClient.modelId} rows=${object.rows.length} inputTokens=${usage?.inputTokens ?? 0} outputTokens=${usage?.outputTokens ?? 0} generateMs=${Date.now() - generateStart}`,
    );

    if (object.rows.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_ROWS_FOUND',
          message: 'No cash flows were found in the input. Try refining your text or hints.',
        },
      };
    }

    const modelInfo = getModelInfo({ modelId: aiClient.modelId });

    return {
      success: true,
      result: {
        rows: object.rows,
        modelId: aiClient.modelId,
        modelName: modelInfo?.name ?? aiClient.modelId,
        usingUserKey: aiClient.usingUserKey,
        tokenCount: {
          input: usage?.inputTokens ?? 0,
          output: usage?.outputTokens ?? 0,
        },
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(
      `${LOG_PREFIX} generateObject threw userId=${userId} modelId=${aiClient.modelId} generateMs=${Date.now() - generateStart} message=${errorMessage}`,
    );

    if (errorMessage.toLowerCase().includes('rate') || errorMessage.toLowerCase().includes('429')) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'AI provider rate limit reached. Please try again in a few minutes.',
          details: errorMessage,
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'AI_ERROR',
        message: 'AI extraction failed.',
        details: errorMessage,
      },
    };
  }
}
