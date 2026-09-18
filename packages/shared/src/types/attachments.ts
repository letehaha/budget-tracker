import type { RecordId } from './record-id';

export const ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_QUOTA_BYTES = 1024 * 1024 * 1024;
export const ATTACHMENTS_MAX_PER_TRANSACTION = 10;

/** SVG and HTML stay out: they execute script when opened. */
export const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

/** URI-encoded original filename, sent alongside the raw-bytes upload body. */
export const ATTACHMENT_FILENAME_HEADER = 'X-Filename';

export interface TransactionAttachmentModel {
  id: RecordId;
  transactionId: RecordId;
  userId: number;
  filename: string;
  mimeType: AttachmentMimeType;
  size: number;
  createdAt: string;
}
