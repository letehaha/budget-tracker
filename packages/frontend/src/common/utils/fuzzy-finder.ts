import Fuse, { type IFuseOptions } from 'fuse.js';

const DEFAULT_THRESHOLD = 0.3;

export function createFuzzyFinder<T>({
  items,
  keys,
  threshold = DEFAULT_THRESHOLD,
}: {
  items: readonly T[];
  keys: IFuseOptions<T>['keys'];
  threshold?: number;
}) {
  const fuse = new Fuse(items as T[], { keys, threshold, includeScore: true });

  return function findOne({ name }: { name: string }): T | null {
    if (!name.trim()) return null;

    const results = fuse.search(name);
    if (!results.length) return null;

    const best = results[0]!;
    if (best.score !== undefined && best.score > threshold) return null;

    return best.item;
  };
}
