import type { StatementCostEstimateFailure } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import { UnexpectedError } from '@js/errors';
import {
  estimateExtractionCost,
  extractTextFromFile,
  resolveTextExtractionSuggestion,
  validateFileBuffer,
} from '@services/import-export/statement-parser';
import { z } from 'zod';

import { documentPasswordSchema } from './shared-schemas';

/**
 * Estimate the cost of extracting transactions from a statement file
 *
 * Expects file as base64 in request body
 * Supports PDF, CSV, and TXT files
 */
export const estimateCostController = createController(
  z.object({
    body: z.object({
      /** Base64 encoded file */
      fileBase64: z.string().min(1, t({ key: 'statementParser.fileContentRequired' })),
      password: documentPasswordSchema,
    }),
  }),
  async ({ user, body }) => {
    const { fileBase64, password } = body;

    // Decode base64 to buffer
    const rawBuffer = Buffer.from(fileBase64, 'base64');

    // Validate file (and extract from PKCS#7 if needed for PDFs)
    const validation = validateFileBuffer({ buffer: rawBuffer });
    if (!validation.valid || !validation.fileBuffer || !validation.fileType) {
      throw new UnexpectedError({
        message: validation.error?.message ?? t({ key: 'statementParser.invalidFile' }),
      });
    }

    const { fileBuffer, fileType } = validation;

    // Extract text from file
    const textResult = await extractTextFromFile({ buffer: fileBuffer, fileType, password });

    if (!textResult.success) {
      // Text extraction failed
      return {
        data: {
          success: false,
          textExtraction: {
            success: false,
            characterCount: textResult.text?.length ?? 0,
            pageCount: textResult.pageCount ?? 1,
            error: textResult.error,
            errorCode: textResult.errorCode,
          },
          fileType,
          suggestion: resolveTextExtractionSuggestion({ fileType, errorCode: textResult.errorCode }),
        } satisfies StatementCostEstimateFailure,
      };
    }

    // Estimate cost
    const costResult = await estimateExtractionCost({
      userId: user.id,
      text: textResult.text!,
      pageCount: textResult.pageCount!,
      fileType,
    });

    if (!costResult.success) {
      // Check if it's a token limit error
      if (costResult.error.code === 'TOKEN_LIMIT_EXCEEDED') {
        return {
          data: {
            success: false,
            error: costResult.error,
            textExtraction: {
              success: true,
              characterCount: textResult.text!.length,
              pageCount: textResult.pageCount!,
            },
            fileType,
            suggestion: costResult.error.details ?? costResult.error.message,
          } satisfies StatementCostEstimateFailure,
        };
      }

      throw new UnexpectedError({
        message: costResult.error.message,
      });
    }

    return {
      data: costResult.estimate,
    };
  },
);
