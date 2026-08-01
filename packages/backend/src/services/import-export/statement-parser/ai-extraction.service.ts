/**
 * AI-powered statement extraction service
 */
import type {
  ExtractedMetadata,
  ExtractedTransaction,
  StatementExtractionResult,
  StatementFileType,
} from '@bt/shared/types';
import { AI_FEATURE } from '@bt/shared/types';
import { logger } from '@js/utils';
import { aiCallGuards, createAIClient, describeMissingAiConfiguration } from '@services/ai';
import { type AIExtractionError, resolveAiExtractionFailure } from '@services/import-export/core/ai-extraction-failure';
import { generateText } from 'ai';

import { STATEMENT_EXTRACTION_SYSTEM_PROMPT, createTextExtractionPrompt, parseAIResponse } from './extraction-prompt';

interface AIExtractionParams {
  userId: number;
  text: string;
  pageCount: number;
  fileType: StatementFileType;
}

type AIExtractionResultType =
  | { success: true; result: StatementExtractionResult }
  | { success: false; error: AIExtractionError };

/**
 * Extract transactions from statement text using AI
 */
export async function extractTransactionsWithAI({
  userId,
  text,
  pageCount,
  fileType,
}: AIExtractionParams): Promise<AIExtractionResultType> {
  // Get AI client for statement parsing feature
  const aiClient = await createAIClient({
    userId,
    feature: AI_FEATURE.statementParsing,
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
    logger.info('[Statement Parser] Starting AI extraction', { modelId: aiClient.modelId, textLength: text.length });

    const { abortSignal, maxRetries } = aiCallGuards({ provider: aiClient.provider });

    const { text: responseText, usage } = await generateText({
      model: aiClient.model,
      system: STATEMENT_EXTRACTION_SYSTEM_PROMPT,
      prompt: createTextExtractionPrompt({ text }),
      abortSignal,
      maxRetries,
    });

    logger.info('[Statement Parser] AI answered', { responseLength: responseText.length, usage });

    // Parse AI response
    const parsed = parseAIResponse({ response: responseText });

    if (!parsed) {
      return {
        success: false,
        error: {
          code: 'EXTRACTION_FAILED',
          message: 'Failed to parse AI response. The output was not in expected format.',
          details: responseText.slice(0, 500),
        },
      };
    }

    if (parsed.transactions.length === 0) {
      if (parsed.droppedRowCount > 0) {
        return {
          success: false,
          error: {
            code: 'EXTRACTION_FAILED',
            message: `The model returned ${parsed.droppedRowCount} row(s), but none of them had both a readable date and a positive amount. Try extracting again, or switch to a different model.`,
            details: responseText.slice(0, 500),
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'NO_TRANSACTIONS_FOUND',
          message: 'No transactions found in the file. The document may not be a bank statement.',
        },
      };
    }

    // Convert to our types
    const transactions: ExtractedTransaction[] = parsed.transactions.map((tx) => ({
      date: tx.date,
      description: tx.description,
      merchant: tx.merchant,
      amount: tx.amount,
      type: tx.type,
      balance: tx.balance ?? undefined,
      confidence: tx.confidence,
    }));

    const metadata: ExtractedMetadata = {
      bankName: parsed.metadata.bankName ?? undefined,
      accountNumberLast4: parsed.metadata.accountNumberLast4 ?? undefined,
      statementPeriod: parsed.metadata.statementPeriod ?? undefined,
      currencyCode: parsed.metadata.currencyCode ?? undefined,
    };

    return {
      success: true,
      result: {
        transactions,
        metadata,
        pageCount,
        fileType,
        tokenCount: {
          input: usage?.inputTokens ?? 0,
          output: usage?.outputTokens ?? 0,
        },
        droppedRowCount: parsed.droppedRowCount,
      },
    };
  } catch (error) {
    const failure = await resolveAiExtractionFailure({ userId, aiClient, error, logPrefix: '[Statement Parser]' });

    return { success: false, error: failure.error };
  }
}
