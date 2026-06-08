/**
 * Trigger a browser file download for an in-memory Blob.
 *
 * Used by the Data Export flow (and any future blob-stream endpoint). The
 * anchor-click + revokeObjectURL pattern is the standard cross-browser way to
 * download a binary payload that came from a `fetch` instead of a navigated
 * URL.
 *
 * Safari starts the download asynchronously after `anchor.click()`, so
 * revoking the object URL on the same tick can silently cancel it. The
 * revoke is deferred to the next macrotask to give the browser time to
 * commit the download.
 */
export function downloadBlob({ blob, filename }: { blob: Blob; filename: string }): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      document.body.removeChild(anchor);
    }
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  // Defer revoke so Safari (and other browsers that fire the download
  // asynchronously) get a chance to capture the URL before it's freed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
