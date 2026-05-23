const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * 1024 * 1024;

/**
 * Formats a byte count into a short human-readable string (e.g. "12.3 KB",
 * "1.4 MB"). Uses binary (1024) units, not decimal. Negative inputs are
 * treated as zero. Sub-KB values render without decimals.
 */
export function formatBytes({ bytes, fractionDigits = 1 }: { bytes: number; fractionDigits?: number }): string {
  const safeBytes = Math.max(0, bytes);
  if (safeBytes < BYTES_PER_KB) return `${safeBytes} B`;
  if (safeBytes < BYTES_PER_MB) return `${(safeBytes / BYTES_PER_KB).toFixed(fractionDigits)} KB`;
  if (safeBytes < BYTES_PER_GB) return `${(safeBytes / BYTES_PER_MB).toFixed(fractionDigits)} MB`;
  return `${(safeBytes / BYTES_PER_GB).toFixed(fractionDigits)} GB`;
}
