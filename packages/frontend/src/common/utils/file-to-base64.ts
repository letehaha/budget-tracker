/**
 * Read a File and return its contents as a base64 string (no data-URL prefix).
 *
 * Used by the backup restore flow to embed the zip in a JSON request body.
 * `readAsDataURL` handles arbitrary binary safely; we strip the leading
 * `data:...;base64,` marker so the caller gets the raw base64 payload.
 */
export function fileToBase64({ file }: { file: File }): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file as base64'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
