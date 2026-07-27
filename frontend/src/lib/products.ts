import type { Product } from "../types/commerce.ts";

export function getProductBySlug(products: Product[], slug: string) {
  if (!slug) {
    return undefined;
  }

  return products.find((product) => product.slug === slug);
}

export function getRelatedProducts(
  products: Product[],
  currentProduct: Product,
  limit = 4,
) {
  if (limit <= 0) {
    return [];
  }

  return products
    .filter((product) => (
      product.kind === currentProduct.kind && product.id !== currentProduct.id
    ))
    .sort((left, right) => (
      Number(right.game === currentProduct.game) - Number(left.game === currentProduct.game)
      || Number(right.productType === currentProduct.productType)
        - Number(left.productType === currentProduct.productType)
      || right.popularity - left.popularity
      || Date.parse(right.createdAt) - Date.parse(left.createdAt)
      || left.id.localeCompare(right.id)
    ))
    .slice(0, Math.floor(limit));
}
