/**
 * AI extraction for investment transactions.
 */
import { AI_FEATURE } from '@bt/shared/types';
import { aiCallGuards, createAIClient, describeMissingAiConfiguration } from '@services/ai';
import { type AIExtractionError, resolveAiExtractionFailure } from '@services/import-export/core/ai-extraction-failure';
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

interface AIExtractionResult {
  rows: AIParsedTransactionRow[];
  tokenCount: { input: number; output: number };
  /** Lines the AI emitted that we couldn't parse. The controller surfaces a
   * warning when this is > 0 so the user knows the import is partial. */
  droppedRowCount: number;
}

type AIExtractionResultType =
  | { success: true; result: AIExtractionResult }
  | { success: false; error: AIExtractionError };

/**
 * Call the AI to extract structured transaction rows from arbitrary text.
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
        message: await describeMissingAiConfiguration({ userId }),
      },
    };
  }

  try {
    const systemPrompt = getSystemPrompt();

    const { abortSignal, maxRetries } = aiCallGuards({ provider: aiClient.provider });

    const { text: responseText, usage } = await generateText({
      model: aiClient.model,
      system: systemPrompt,
      prompt: createTextExtractionPrompt({ text }),
      abortSignal,
      maxRetries,
    });

    const { rows, droppedRowCount } = parseAIResponse({ response: responseText });

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
        droppedRowCount,
        tokenCount: {
          input: usage?.inputTokens ?? 0,
          output: usage?.outputTokens ?? 0,
        },
      },
    };
  } catch (error) {
    const failure = await resolveAiExtractionFailure({
      userId,
      aiClient,
      error,
      logPrefix: '[Investment Txn Parser]',
    });

    return { success: false, error: failure.error };
  }
}
