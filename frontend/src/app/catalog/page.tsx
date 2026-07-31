import type { Metadata } from "next";
import { Suspense } from "react";

import { CatalogScreen } from "@/features/catalog/CatalogScreen";
import { parseCatalogSearchParams, serializeCatalogFilters } from "@/lib/catalog";
import { fetchCatalogList } from "@/lib/catalog-api";

import { CatalogLoading } from "./loading";

export const metadata: Metadata = {
  title: "Каталог цифровых товаров — Vault",
  description: "Пополнение Steam и игровые предметы в каталоге Vault.",
};

type CatalogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toUrlSearchParams(values: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  });
  return params;
}

export const dynamic = "force-dynamic";

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const filters = parseCatalogSearchParams(toUrlSearchParams(await searchParams));
  const filtersKey = serializeCatalogFilters(filters).toString();
  const catalog = await fetchCatalogList({ filters });

  return (
    <Suspense fallback={<CatalogLoading />}>
      <CatalogScreen key={filtersKey} products={catalog.items} pagination={catalog.pagination} facets={catalog.facets} />
    </Suspense>
  );
}
