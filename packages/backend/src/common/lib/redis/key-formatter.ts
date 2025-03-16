// This helper became required with parallel Jest tests. Without this change different tests
// will override Redis in their processes that will lead to broken tests
export const redisKeyFormatter = (key) => {
  if (process.env.JEST_WORKER_ID) {
    return `${process.env.JEST_WORKER_ID}-${key}`;
  }
  return key;
};
