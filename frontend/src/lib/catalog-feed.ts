export const CATALOG_FEED_BATCH_SIZE = 8;

export type CatalogFeedEntry<T> = {
  key: string;
  item: T;
};

export function getNextCatalogFeedSize(currentSize: number, totalSize = Number.POSITIVE_INFINITY) {
  const safeSize = Number.isFinite(currentSize) ? Math.max(0, Math.floor(currentSize)) : 0;
  const nextSize = safeSize + CATALOG_FEED_BATCH_SIZE;
  return Number.isFinite(totalSize) ? Math.min(Math.max(0, Math.floor(totalSize)), nextSize) : nextSize;
}

export function createCatalogFeedEntries<T extends { id: string }>(
  items: readonly T[],
  visibleSize: number,
): CatalogFeedEntry<T>[] {
  const safeSize = Number.isFinite(visibleSize) ? Math.max(0, Math.floor(visibleSize)) : 0;

  if (!items.length || safeSize === 0) return [];

  return items.slice(0, safeSize).map((item) => {

    return {
      key: item.id,
      item,
    };
  });
}
