import { ATTACHMENT_MIME_TYPES } from '@bt/shared/types';

import type { CompressImageResponse } from './compress-image.worker';

const COMPRESSIBLE_MIME_TYPES: string[] = ATTACHMENT_MIME_TYPES.filter((type) => type.startsWith('image/'));

const isSupported = () => typeof Worker !== 'undefined' && typeof createImageBitmap === 'function';

const toJpegName = ({ filename }: { filename: string }) => `${filename.replace(/\.[^./\\]+$/, '')}.jpg`;

/**
 * Re-encodes images to JPEG off the main thread, capping the long edge. PDFs and
 * anything the worker cannot shrink come back untouched, so a failure only costs
 * bandwidth.
 */
export const compressImages = async ({ files }: { files: File[] }): Promise<File[]> => {
  const targets = files.filter((file) => COMPRESSIBLE_MIME_TYPES.includes(file.type));
  if (!targets.length || !isSupported()) return files;

  let worker: Worker;
  try {
    worker = new Worker(new URL('./compress-image.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return files;
  }

  const pending = new Map<number, (blob: Blob | null) => void>();
  worker.addEventListener('message', (event: MessageEvent<CompressImageResponse>) => {
    const { id, blob } = event.data;
    pending.get(id)?.(blob ?? null);
    pending.delete(id);
  });
  const failAll = () => {
    pending.forEach((resolve) => resolve(null));
    pending.clear();
  };
  worker.addEventListener('error', failAll);
  worker.addEventListener('messageerror', failAll);

  try {
    const compressed = await Promise.all(
      files.map((file, id) => {
        if (!targets.includes(file)) return Promise.resolve(file);

        return new Promise<File>((resolve) => {
          pending.set(id, (blob) => {
            const isSmaller = blob !== null && blob.size < file.size;
            resolve(
              isSmaller
                ? new File([blob], toJpegName({ filename: file.name }), { type: blob.type, lastModified: Date.now() })
                : file,
            );
          });
          worker.postMessage({ id, file });
        });
      }),
    );

    return compressed;
  } finally {
    worker.terminate();
  }
};
