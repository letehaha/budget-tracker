const MAX_EDGE_PX = 2000;
const JPEG_QUALITY = 0.8;

/** Scales down so the long edge fits `maxEdge`. Never upscales. */
export const fitWithinMaxEdge = ({
  width,
  height,
  maxEdge,
}: {
  width: number;
  height: number;
  maxEdge: number;
}): { width: number; height: number } => {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };

  const scale = maxEdge / longEdge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

export interface CompressImageRequest {
  id: number;
  file: File;
}

export interface CompressImageResponse {
  id: number;
  blob?: Blob;
  error?: string;
}

const post = (message: CompressImageResponse) =>
  (self as unknown as { postMessage: (value: CompressImageResponse) => void }).postMessage(message);

const compress = async ({ file }: { file: File }): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);

  try {
    const { width, height } = fitWithinMaxEdge({ width: bitmap.width, height: bitmap.height, maxEdge: MAX_EDGE_PX });
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas 2d context unavailable');

    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  } finally {
    bitmap.close();
  }
};

self.addEventListener('message', (event: MessageEvent<CompressImageRequest>) => {
  const { id, file } = event.data;

  compress({ file }).then(
    (blob) => post({ id, blob }),
    (error: unknown) => post({ id, error: String(error) }),
  );
});
