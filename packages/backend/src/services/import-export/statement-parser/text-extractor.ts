/**
 * Text extraction from various file formats (PDF, CSV, TXT)
 */
import type { StatementFileType, StatementTextExtractionErrorCode } from '@bt/shared/types';
import { logger } from '@js/utils';
import { type Tiktoken, getEncoding } from 'js-tiktoken';
import { extractText, getDocumentProxy } from 'unpdf';

/** Cached tokenizer encoder instance */
let tokenEncoder: Tiktoken | null = null;

/**
 * Get or create the token encoder (cached for performance)
 */
function getTokenEncoder(): Tiktoken {
  if (!tokenEncoder) {
    // cl100k_base is used by GPT-4 and works well for Claude models too
    tokenEncoder = getEncoding('cl100k_base');
  }
  return tokenEncoder;
}

interface TextExtractionResult {
  success: boolean;
  text?: string;
  pageCount?: number;
  fileType: StatementFileType;
  error?: string;
  errorCode?: StatementTextExtractionErrorCode;
}

/** pdf.js `PasswordException` codes: a missing password vs. a rejected one. */
const PDF_PASSWORD_NEEDED_CODE = 1;
const PDF_PASSWORD_INCORRECT_CODE = 2;

/**
 * pdf.js signals encryption with a `PasswordException`, matched by name because
 * the class lives inside the unpdf bundle and cannot be imported for `instanceof`.
 */
function classifyPdfError({ error }: { error: unknown }): StatementTextExtractionErrorCode {
  const candidate = error as { name?: unknown; code?: unknown } | null | undefined;

  if (candidate?.name === 'PasswordException') {
    if (candidate.code === PDF_PASSWORD_NEEDED_CODE) return 'PASSWORD_REQUIRED';
    if (candidate.code === PDF_PASSWORD_INCORRECT_CODE) return 'PASSWORD_INVALID';
  }

  return 'PARSE_FAILED';
}

/**
 * Extract text content from a PDF buffer
 */
async function extractTextFromPDF({
  buffer,
  password,
}: {
  buffer: Buffer;
  password?: string;
}): Promise<TextExtractionResult> {
  try {
    // Disable eval explicitly: hardens against malicious PDFs (CVE-2024-4367-class).
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { isEvalSupported: false, password });
    const { text, totalPages } = await extractText(pdf, { mergePages: true });

    const trimmed = text.trim();
    const pageCount = totalPages || 1;

    if (!trimmed || trimmed.length < 50) {
      // Very little text extracted - likely a scanned/image PDF
      logger.info('Text extraction failed', {
        errorCode: 'NO_TEXT_CONTENT',
        fileType: 'pdf',
        pageCount,
        characterCount: trimmed.length,
      });

      return {
        success: false,
        text: trimmed,
        pageCount,
        fileType: 'pdf',
        error: 'PDF contains too little extractable text. It may be a scanned document.',
        errorCode: 'NO_TEXT_CONTENT',
      };
    }

    return {
      success: true,
      text: trimmed,
      pageCount,
      fileType: 'pdf',
    };
  } catch (error) {
    const errorCode = classifyPdfError({ error });

    logger.info('Text extraction failed', {
      errorCode,
      fileType: 'pdf',
      sizeBytes: buffer.length,
      passwordProvided: Boolean(password),
    });

    return {
      success: false,
      fileType: 'pdf',
      error: error instanceof Error ? error.message : 'Failed to parse PDF',
      errorCode,
    };
  }
}

/**
 * Extract text content from a CSV or TXT buffer
 */
function extractTextFromTextFile({
  buffer,
  fileType,
}: {
  buffer: Buffer;
  fileType: 'csv' | 'txt';
}): TextExtractionResult {
  try {
    const text = buffer.toString('utf8').trim();

    if (!text || text.length < 10) {
      logger.info('Text extraction failed', {
        errorCode: 'NO_TEXT_CONTENT',
        fileType,
        characterCount: text.length,
      });

      return {
        success: false,
        text,
        pageCount: 1,
        fileType,
        error: 'File contains too little text to extract transactions.',
        errorCode: 'NO_TEXT_CONTENT',
      };
    }

    return {
      success: true,
      text,
      pageCount: 1,
      fileType,
    };
  } catch (error) {
    logger.info('Text extraction failed', { errorCode: 'PARSE_FAILED', fileType, sizeBytes: buffer.length });

    return {
      success: false,
      fileType,
      error: error instanceof Error ? error.message : 'Failed to read text file',
      errorCode: 'PARSE_FAILED',
    };
  }
}

/**
 * Extract text content from a file buffer
 * Handles PDF, CSV, and TXT files
 */
export async function extractTextFromFile({
  buffer,
  fileType,
  password,
}: {
  buffer: Buffer;
  fileType: StatementFileType;
  /** Document password, only meaningful for encrypted PDFs */
  password?: string;
}): Promise<TextExtractionResult> {
  switch (fileType) {
    case 'pdf':
      return extractTextFromPDF({ buffer, password });
    case 'csv':
    case 'txt':
      return extractTextFromTextFile({ buffer, fileType });
    default:
      logger.info('Text extraction failed', { errorCode: 'UNSUPPORTED_FILE_TYPE', fileType, sizeBytes: buffer.length });

      return {
        success: false,
        fileType,
        error: `Unsupported file type: ${fileType}`,
      };
  }
}

/**
 * Estimate token count from text using a proper tokenizer
 */
export function estimateTokenCount({ text }: { text: string }): number {
  const encoder = getTokenEncoder();
  return encoder.encode(text).length;
}
