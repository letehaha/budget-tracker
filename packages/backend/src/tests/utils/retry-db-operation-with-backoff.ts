/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Retry utility with exponential backoff specifically designed for database deadlock handling
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 10,
  baseDelay: number = 100,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if it's a deadlock error
      const isDeadlock = error?.original?.code === '40P01' || error?.message?.includes('deadlock detected');

      if (isDeadlock && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        console.log(
          `Database deadlock detected (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay.toFixed(0)}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Log detailed error for non-deadlock errors or final retry
      if (!isDeadlock) {
        console.error('Non-deadlock database error:', error.message);
      } else {
        console.error('Database deadlock persisted after all retries:', error.message);
      }

      throw error;
    }
  }

  throw lastError!;
}
