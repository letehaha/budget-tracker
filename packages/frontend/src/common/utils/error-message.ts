/**
 * Extracts a human-readable message from a value caught in `catch (err)`.
 * Returns `err.message` when the value is an `Error`, otherwise the provided
 * fallback. Use to render API/mutation failures in toast notifications.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
