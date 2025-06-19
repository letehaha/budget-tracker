export const getQueryBooleanValue = (value: string): boolean => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Boolean(value);
};

// To wait until `fn` returns true
export const until = async <T>(
  fn: () => Promise<T> | T,
  { timeout = 30_000, interval = 500 }: { timeout?: number; interval?: number } = {},
): Promise<void> => {
  const startTime = Date.now();

  const poll = async (resolve: () => void, reject: (reason: Error) => void): Promise<void> => {
    try {
      if (await fn()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Timeout exceeded'));
      } else {
        setTimeout(() => poll(resolve, reject), interval);
      }
    } catch (error) {
      reject(error as Error);
    }
  };

  return new Promise<void>(poll);
};
