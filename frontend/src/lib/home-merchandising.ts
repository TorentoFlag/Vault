import { filterProducts, type ProductFilter, type SearchableProduct } from "./marketplace.ts";

export type PopularGridEntry<T extends SearchableProduct> =
  | { type: "product"; product: T }
  | { type: "catalog-link" };

const catalogLinkPosition = 6;
export type MerchandisingMode = "popular" | "bestsellers" | "new";

export function getMerchandisingCopy(mode: MerchandisingMode) {
  if (mode === "bestsellers") return { title: "Бестселлеры", description: "Товары с самым высоким спросом в каталоге." };
  if (mode === "new") return { title: "Новинки", description: "Последние добавленные товары и категории." };
  return { title: "Популярные товары", description: "Товары, которые чаще всего выбирают пользователи." };
}

export function orderMerchandisingProducts<T extends SearchableProduct & { popularity: number; createdAt?: string }>(
  products: T[],
  mode: MerchandisingMode,
) {
  if (mode === "bestsellers") return [...products].sort((left, right) => right.popularity - left.popularity);
  if (mode === "new") return [...products].sort((left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""));

  const queues = (["skins", "steam", "gpt"] as const)
    .map((kind) => products.filter((product) => product.kind === kind).sort((left, right) => right.popularity - left.popularity));
  const ordered: T[] = [];
  while (queues.some((queue) => queue.length)) {
    queues.forEach((queue) => {
      const product = queue.shift();
      if (product) ordered.push(product);
    });
  }
  return ordered;
}

export function createPopularGridEntries<T extends SearchableProduct>(
  products: T[],
  filter: ProductFilter,
): PopularGridEntry<T>[] {
  const visible = filterProducts(products, filter);
  const productEntries: PopularGridEntry<T>[] = visible.map((product) => ({
    type: "product",
    product,
  }));

  if (filter !== "all" || productEntries.length <= catalogLinkPosition) {
    return productEntries;
  }

  return [
    ...productEntries.slice(0, catalogLinkPosition),
    { type: "catalog-link" },
    ...productEntries.slice(catalogLinkPosition),
  ];
}
