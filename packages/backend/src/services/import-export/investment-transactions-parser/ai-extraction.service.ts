/**
 * AI extraction for investment transactions.
 * Mirrors statement-parser's ai-extraction.service: build a system prompt,
 * call the resolved model, parse the CSV response, return typed rows.
 */
import { AI_FEATURE } from '@bt/shared/types';
import { logger } from '@js/utils';
import { createAIClient } from '@services/ai';
import { generateText } from 'ai';

import {
  type AIParsedTransactionRow,
  createTextExtractionPrompt,
  getSystemPrompt,
  parseAIResponse,
} from './extraction-prompt';

interface AIExtractionParams {
  userId: number;
  text: string;
}

interface AIExtractionError {
  code: 'NO_AI_CONFIGURED' | 'AI_ERROR' | 'EXTRACTION_FAILED' | 'NO_TRANSACTIONS_FOUND' | 'RATE_LIMITED';
  message: string;
  details?: string;
}

interface AIExtractionResult {
  rows: AIParsedTransactionRow[];
  tokenCount: { input: number; output: number };
}

type AIExtractionResultType =
  | { success: true; result: AIExtractionResult }
  | { success: false; error: AIExtractionError };

/**
 * Call the AI to extract structured transaction rows from arbitrary text.
 * Errors are returned as `{ success: false, error }` rather than thrown so the
 * controller can surface a typed error code without try/catch ceremony.
 */
export async function extractInvestmentTransactionsWithAI({
  userId,
  text,
}: AIExtractionParams): Promise<AIExtractionResultType> {
  const aiClient = await createAIClient({
    userId,
    feature: AI_FEATURE.investmentTransactionsParsing,
  });

  if (!aiClient) {
    return {
      success: false,
      error: {
        code: 'NO_AI_CONFIGURED',
        message: 'No AI provider configured. Please add an API key in settings.',
      },
    };
  }

  try {
    const systemPrompt = getSystemPrompt();
    const { text: responseText, usage } = await generateText({
      model: aiClient.model,
      system: systemPrompt,
      prompt: createTextExtractionPrompt({ text }),
    });

    const rows = parseAIResponse({ response: responseText });

    if (rows.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_TRANSACTIONS_FOUND',
          message: 'No transactions found in the file.',
          details: responseText.slice(0, 500),
        },
      };
    }

    return {
      success: true,
      result: {
        rows,
        tokenCount: {
          input: usage?.inputTokens ?? 0,
          output: usage?.outputTokens ?? 0,
        },
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({
      message: '[Investment Txn Parser] AI extraction failed',
      error: error as Error,
    });

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
        message: 'AI extraction failed',
        details: errorMessage,
      },
    };
  }
}
