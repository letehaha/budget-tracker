import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import { UnexpectedError } from '@js/errors';
import {
  extractTextFromFile,
  extractTransactionsWithAI,
  validateFileBuffer,
} from '@services/import-export/statement-parser';
import { z } from 'zod';

/**
 * Extract transactions from a statement file using AI
 *
 * Expects file as base64 in request body
 * Supports PDF, CSV, and TXT files
 */
export const extractController = createController(
  z.object({
    body: z.object({
      /** Base64 encoded file */
      fileBase64: z.string().min(1, t({ key: 'statementParser.fileContentRequired' })),
    }),
  }),
  async ({ user, body }) => {
    try {
      const { fileBase64 } = body;

      // Debug logging
      console.log('[Statement Parser] Extract - Base64 length:', fileBase64.length);

      // Decode base64 to buffer
      const rawBuffer = Buffer.from(fileBase64, 'base64');

      // Debug logging
      console.log('[Statement Parser] Extract - Buffer first 10 bytes:', rawBuffer.subarray(0, 10));

      // Validate file (and extract from PKCS#7 if needed for PDFs)
      const validation = validateFileBuffer({ buffer: rawBuffer });
      if (!validation.valid || !validation.fileBuffer || !validation.fileType) {
        throw new UnexpectedError({
          message: validation.error?.message ?? t({ key: 'statementParser.invalidFile' }),
        });
      }

      const { fileBuffer, fileType } = validation;

      if (validation.extractedFromSigned) {
        console.log('[Statement Parser] Extract - Using PDF extracted from signed container');
      }

      // Extract text from file
      console.log('[Statement Parser] Extract - Starting text extraction...');
      const textResult = await extractTextFromFile({ buffer: fileBuffer, fileType });
      console.log('[Statement Parser] Extract - Text extraction result:', {
        success: textResult.success,
        textLength: textResult.text?.length,
        pageCount: textResult.pageCount,
        fileType: textResult.fileType,
        error: textResult.error,
      });

      if (!textResult.success) {
        throw new UnexpectedError({
          message:
            textResult.error ??
            (fileType === 'pdf'
              ? t({ key: 'statementParser.failedToExtractTextPdf' })
              : t({ key: 'statementParser.failedToExtractText' })),
        });
      }

      // Extract transactions using AI
      console.log('[Statement Parser] Extract - Starting AI extraction...');
      const extractionResult = await extractTransactionsWithAI({
        userId: user.id,
        text: textResult.text!,
        pageCount: textResult.pageCount!,
        fileType,
      });
      console.log('[Statement Parser] Extract - AI extraction result:', {
        success: extractionResult.success,
        transactionCount: extractionResult.success ? extractionResult.result.transactions.length : 0,
        error: !extractionResult.success ? extractionResult.error : undefined,
      });

      if (!extractionResult.success) {
        throw new UnexpectedError({
          message: extractionResult.error.message,
        });
      }

      return {
        data: extractionResult.result,
      };
    } catch (err) {
      console.error('[Statement Parser] Extract - Error:', err);
      throw err;
    }
  },
);
