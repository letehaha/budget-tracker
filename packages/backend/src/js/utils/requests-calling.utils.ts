/**
 * Helper function for paginating data (typically from an API)
 */
export async function paginate<TData>({
  fetchData,
  pageSize,
  delay,
}: {
  fetchData: (offset: number, count: number) => Promise<TData[]>;
  pageSize: number;
  delay?: { onDelay: (message: string) => void; milliseconds: number };
}): Promise<TData[]> {
  const result: TData[] = [];
  let offset = 0;
  let data: TData[] = [];

  do {
    // fetch one page of data
    data = await fetchData(offset, pageSize);

    // yield each item in the page (lets the async iterator move through one page of data)
    result.push(...data);

    // increase the offset by the page count so the next iteration fetches fresh data
    offset += pageSize;

    if (delay && data.length >= pageSize) {
      delay.onDelay(`Waiting ${delay.milliseconds / 1000} seconds`);
      await new Promise((resolve) => setTimeout(resolve, delay.milliseconds));
    }
  } while (data.length >= pageSize);

  return result;
}

interface PaginateParams<T> {
  pageSize: number;
  delay?: {
    onDelay: (message: string) => void;
    milliseconds: number;
  };
  fetchData: (limit: number, nextCursor?: string) => Promise<{ data: T[]; nextUrl?: string }>;
}

/**
 * Handles paginated API endpoints that use a `next_url` cursor.
 * It will continue fetching data until the API stops providing a next_url.
 * @param params - Configuration for the pagination.
 * @returns A promise that resolves with an array of all fetched items.
 */
export async function paginateWithNextUrl<T>({ pageSize, delay, fetchData }: PaginateParams<T>): Promise<T[]> {
  let allData: T[] = [];
  let nextUrl: string | undefined;
  let hasMore = true;

  do {
    // Extract the cursor from the full next_url
    const cursor = nextUrl ? new URL(nextUrl).searchParams.get('cursor') : undefined;

    const response = await fetchData(pageSize, cursor || undefined);

    if (response.data) {
      allData = allData.concat(response.data);
    }

    nextUrl = response.nextUrl;
    hasMore = !!nextUrl;

    if (hasMore && delay) {
      delay.onDelay(`Paginating: waiting ${delay.milliseconds}ms before next call.`);
      await new Promise((resolve) => setTimeout(resolve, delay.milliseconds));
    }
  } while (hasMore);

  return allData;
}

/**
 * Wraps a function with basic retry logic
 */
export async function withRetry<TResult>(
  fn: (attempt: number) => TResult | Promise<TResult>,
  {
    maxRetries = 10,
    onError,
    delay,
  }: {
    maxRetries?: number;
    onError?(error: unknown, attempt: number): boolean | undefined; // true = retry, false = stop
    delay?: number; // milliseconds
  } = {},
) {
  let retries = 0;
  let lastError: unknown;

  while (retries <= maxRetries) {
    if (delay && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const res = await fn(retries);
      return res;
    } catch (err) {
      lastError = err;

      if (onError) {
        const shouldRetry = onError(err, retries);
        if (!shouldRetry) {
          break;
        }
      }

      retries++;
    }
  }

  throw lastError;
}
