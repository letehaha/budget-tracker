import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import { UnexpectedError, ValidationError } from '@js/errors';
import {
  extractTextFromFile,
  extractTransactionsWithAI,
  resolveTextExtractionSuggestion,
  validateFileBuffer,
} from '@services/import-export/statement-parser';
import { z } from 'zod';

import { documentPasswordSchema } from './shared-schemas';

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
      const message = resolveTextExtractionSuggestion({ fileType, errorCode: textResult.errorCode });

      // A missing or wrong password is fixed by the user retyping it, so it must
      // not read as a server fault (which would also page us through Sentry).
      if (textResult.errorCode === 'PASSWORD_REQUIRED' || textResult.errorCode === 'PASSWORD_INVALID') {
        throw new ValidationError({ message });
      }

      throw new UnexpectedError({ message });
    }

    // Extract transactions using AI
    const extractionResult = await extractTransactionsWithAI({
      userId: user.id,
      text: textResult.text!,
      pageCount: textResult.pageCount!,
      fileType,
    });

    if (!extractionResult.success) {
      throw new UnexpectedError({
        message: extractionResult.error.message,
      });
    }

    return {
      data: extractionResult.result,
    };
  },
);
