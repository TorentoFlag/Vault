import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductDetailScreen } from "@/features/product/ProductDetailScreen";
import { sanitizeCatalogReturnPath } from "@/lib/catalog";
import { fetchCatalogList, fetchCatalogProductBySlug } from "@/lib/catalog-api";
import { getRelatedProducts } from "@/lib/products";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchCatalogProductBySlug(slug);

  if (!product) {
    return { title: "Товар не найден — Vault" };
  }

  return {
    title: `${product.title} — Vault`,
    description: `${product.description} Стоимость: ${product.priceCoins.toLocaleString("ru-RU")} Coins.`,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await fetchCatalogProductBySlug(slug);

  if (!product) notFound();
  const catalog = await fetchCatalogList();

  return (
    <ProductDetailScreen
      product={product}
      relatedProducts={getRelatedProducts(catalog.items, product, 4)}
      catalogReturnHref={sanitizeCatalogReturnPath("/catalog")}
    />
  );
}
