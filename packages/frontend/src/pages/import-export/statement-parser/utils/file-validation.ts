/**
 * File validation utilities for statement parsing
 * Validates file content using magic bytes to prevent renamed/malicious files
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_EXTENSIONS = ['.pdf', '.csv', '.txt'];

// Magic bytes for file type detection
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46]; // %PDF
const PKCS7_MAGIC_BYTE = 0x30; // ASN.1 SEQUENCE (signed PDF container)

interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Read the first N bytes of a file for magic byte detection
 */
async function readFileHeader({ file, bytes = 8 }: { file: File; bytes?: number }): Promise<Uint8Array> {
  const slice = file.slice(0, bytes);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Check if bytes match PDF magic bytes
 */
function isPdfMagicBytes({ header }: { header: Uint8Array }): boolean {
  if (header.length < 4) return false;
  return PDF_MAGIC_BYTES.every((byte, i) => header[i] === byte);
}

/**
 * Check if file appears to be valid text content (for CSV/TXT)
 * Reads a sample and checks if majority are printable characters
 */
async function isValidTextContent({ file }: { file: File }): Promise<boolean> {
  const sampleSize = Math.min(file.size, 1000);
  const slice = file.slice(0, sampleSize);
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let printableCount = 0;
  for (const byte of bytes) {
    // Printable ASCII (32-126), tab (9), newline (10), carriage return (13)
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      printableCount++;
    }
  }

  // If >90% printable, treat as valid text
  return printableCount / bytes.length > 0.9;
}

/**
 * Validate file content matches the expected type based on extension.
 * This prevents users from uploading renamed files (e.g., .exe renamed to .pdf)
 */
async function validateFileContent({ file }: { file: File }): Promise<FileValidationResult> {
  const ext = '.' + (file.name.toLowerCase().split('.').pop() || '');
  const header = await readFileHeader({ file });

  if (ext === '.pdf') {
    // Check for PDF magic bytes or PKCS#7 container (signed PDF)
    const isPdf = isPdfMagicBytes({ header });
    const isPkcs7 = header[0] === PKCS7_MAGIC_BYTE;

    if (!isPdf && !isPkcs7) {
      return {
        valid: false,
        error: 'File does not appear to be a valid PDF. The file may be corrupted or renamed.',
      };
    }
  } else if (ext === '.csv' || ext === '.txt') {
    // For text files, verify content is actually text
    const isText = await isValidTextContent({ file });

    if (!isText) {
      return {
        valid: false,
        error: `File does not appear to be a valid ${ext.toUpperCase().slice(1)} file. The file may be binary or renamed.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate a file for statement upload (extension, size, and content)
 */
export async function validateStatementFile({ file }: { file: File }): Promise<FileValidationResult> {
  // 1. Check file extension first (quick check)
  const ext = '.' + (file.name.toLowerCase().split('.').pop() || '');
  const isValidExtension = SUPPORTED_EXTENSIONS.includes(ext);

  if (!isValidExtension) {
    return {
      valid: false,
      error: 'Unsupported file type. Please upload a PDF, CSV, or TXT file.',
    };
  }

  // 2. Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum of 10MB`,
    };
  }

  // 3. Validate actual file content matches extension (prevents renamed files)
  return validateFileContent({ file });
}
