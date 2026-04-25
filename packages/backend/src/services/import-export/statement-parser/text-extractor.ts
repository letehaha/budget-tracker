/**
 * Text extraction from various file formats (PDF, CSV, TXT)
 */
import type { StatementFileType } from '@bt/shared/types';
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
}

/**
 * Extract text content from a PDF buffer
 */
async function extractTextFromPDF({ buffer }: { buffer: Buffer }): Promise<TextExtractionResult> {
  try {
    // Disable eval explicitly: hardens against malicious PDFs (CVE-2024-4367-class).
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { isEvalSupported: false });
    const { text, totalPages } = await extractText(pdf, { mergePages: true });

    const trimmed = text.trim();
    const pageCount = totalPages || 1;

    if (!trimmed || trimmed.length < 50) {
      // Very little text extracted - likely a scanned/image PDF
      return {
        success: false,
        text: trimmed,
        pageCount,
        fileType: 'pdf',
        error: 'PDF contains too little extractable text. It may be a scanned document.',
      };
    }

    return {
      success: true,
      text: trimmed,
      pageCount,
      fileType: 'pdf',
    };
  } catch (error) {
    return {
      success: false,
      fileType: 'pdf',
      error: error instanceof Error ? error.message : 'Failed to parse PDF',
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
      return {
        success: false,
        text,
        pageCount: 1,
        fileType,
        error: 'File contains too little text to extract transactions.',
      };
    }

    return {
      success: true,
      text,
      pageCount: 1,
      fileType,
    };
  } catch (error) {
    return {
      success: false,
      fileType,
      error: error instanceof Error ? error.message : 'Failed to read text file',
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
}: {
  buffer: Buffer;
  fileType: StatementFileType;
}): Promise<TextExtractionResult> {
  switch (fileType) {
    case 'pdf':
      return extractTextFromPDF({ buffer });
    case 'csv':
    case 'txt':
      return extractTextFromTextFile({ buffer, fileType });
    default:
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
