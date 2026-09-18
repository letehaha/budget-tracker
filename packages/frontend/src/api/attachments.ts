import { api } from '@/api/_api';
import { fetchBinaryDownload } from '@/api/_binary-download';
import { ATTACHMENT_FILENAME_HEADER, type AttachmentMimeType, type TransactionAttachmentModel } from '@bt/shared/types';

export const uploadTransactionAttachment = async ({
  transactionId,
  file,
}: {
  transactionId: string;
  file: File;
}): Promise<TransactionAttachmentModel> =>
  api.postRaw({
    endpoint: `/transactions/${transactionId}/attachments`,
    body: file,
    headers: {
      'Content-Type': 'application/octet-stream',
      [ATTACHMENT_FILENAME_HEADER]: encodeURIComponent(file.name),
    },
  });

export const loadTransactionAttachments = async ({
  transactionId,
}: {
  transactionId: string;
}): Promise<TransactionAttachmentModel[]> => api.get(`/transactions/${transactionId}/attachments`);

/** `mimeType` is stamped onto the blob so an object URL of a PDF renders in an iframe. */
export const loadAttachmentFile = async ({
  id,
  mimeType,
}: {
  id: string;
  mimeType: AttachmentMimeType;
}): Promise<Blob> => {
  const { blob } = await fetchBinaryDownload({
    path: `/attachments/${id}/file`,
    method: 'GET',
    accept: `${mimeType}, application/json`,
    feature: 'transaction-attachments',
  });

  return blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
};

export const deleteAttachment = async ({ id }: { id: string }): Promise<void> => {
  await api.delete(`/attachments/${id}`);
};
