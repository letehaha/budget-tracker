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
import { createAIClient } from '@services/ai';
import { generateText } from 'ai';

import { STATEMENT_EXTRACTION_SYSTEM_PROMPT, createTextExtractionPrompt, parseAIResponse } from './extraction-prompt';

export interface AIExtractionParams {
  userId: number;
  text: string;
  pageCount: number;
  fileType: StatementFileType;
}

export interface AIExtractionError {
  code: 'NO_AI_CONFIGURED' | 'AI_ERROR' | 'EXTRACTION_FAILED' | 'NO_TRANSACTIONS_FOUND' | 'RATE_LIMITED';
  message: string;
  details?: string;
}

export type AIExtractionResultType =
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
        message: 'No AI provider configured. Please add an API key in settings.',
      },
    };
  }

  try {
    console.log('[Statement Parser] AI - Calling model:', aiClient.modelId);
    console.log('[Statement Parser] AI - Text length:', text.length);

    // Generate extraction using AI
    const { text: responseText, usage } = await generateText({
      model: aiClient.model,
      system: STATEMENT_EXTRACTION_SYSTEM_PROMPT,
      prompt: createTextExtractionPrompt({ text }),
    });

    console.log('[Statement Parser] AI - Response length:', responseText.length);
    console.log('[Statement Parser] AI - Usage:', usage);

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
      },
    };
  } catch (error) {
    // Log full error for debugging
    console.error('[Statement Parser] AI - Error:', error);

    // Handle specific error types
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('[Statement Parser] AI - Error message:', errorMessage);
    console.error('[Statement Parser] AI - Error stack:', errorStack);

    // Check for rate limiting
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

/**
 * Placeholder for image/native PDF extraction
 * This will be implemented when adding vision model support
 */
export async function extractTransactionsWithAIVision(_params: {
  userId: number;
  pdfBuffer: Buffer;
  pageCount: number;
}): Promise<AIExtractionResultType> {
  // TODO: Implement native PDF support for Anthropic
  // TODO: Implement image conversion for vision models
  return {
    success: false,
    error: {
      code: 'EXTRACTION_FAILED',
      message: 'Image-based extraction is not yet implemented',
    },
  };
}
