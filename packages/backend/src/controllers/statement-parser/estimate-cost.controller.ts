import { createController } from '@controllers/helpers/controller-factory';
import { UnexpectedError } from '@js/errors';
import {
  estimateExtractionCost,
  extractTextFromFile,
  validateFileBuffer,
} from '@services/import-export/statement-parser';
import { z } from 'zod';

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
      fileBase64: z.string().min(1, 'File content is required'),
    }),
  }),
  async ({ user, body }) => {
    try {
      const { fileBase64 } = body;

      // Debug logging
      console.log('[Statement Parser] Base64 prefix:', fileBase64.substring(0, 50));
      console.log('[Statement Parser] Base64 length:', fileBase64.length);

      // Decode base64 to buffer
      const rawBuffer = Buffer.from(fileBase64, 'base64');

      // Debug logging
      console.log('[Statement Parser] Buffer first 10 bytes:', rawBuffer.subarray(0, 10));

      // Validate file (and extract from PKCS#7 if needed for PDFs)
      const validation = validateFileBuffer({ buffer: rawBuffer });
      if (!validation.valid || !validation.fileBuffer || !validation.fileType) {
        throw new UnexpectedError({
          message: validation.error?.message ?? 'Invalid file',
        });
      }

      const { fileBuffer, fileType } = validation;

      if (validation.extractedFromSigned) {
        console.log('[Statement Parser] Using PDF extracted from signed container');
      }

      // Extract text from file
      const textResult = await extractTextFromFile({ buffer: fileBuffer, fileType });

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
            },
            fileType,
            suggestion:
              fileType === 'pdf'
                ? 'Text extraction failed. The PDF may be a scanned document. Image-based extraction is not yet implemented.'
                : 'Failed to extract text from file.',
          },
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
              suggestion: costResult.error.details,
            },
          };
        }

        throw new UnexpectedError({
          message: costResult.error.message,
        });
      }

      return {
        data: costResult.estimate,
      };
    } catch (err) {
      console.log('err', err);
      throw err;
    }
  },
);
