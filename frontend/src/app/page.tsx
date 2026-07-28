import { Categories } from "@/features/home/Categories";
import { CoinConverter } from "@/features/home/CoinConverter";
import { FAQAccordion } from "@/features/home/FAQAccordion";
import { Hero } from "@/features/home/Hero";
import { HowItWorks } from "@/features/home/HowItWorks";
import { NewProducts } from "@/features/home/NewProducts";
import { ProductCollection } from "@/features/home/ProductCollection";
import { SteamTopUp } from "@/features/home/SteamTopUp";
import { fetchCatalogList } from "@/lib/catalog-api";
import { orderMerchandisingProducts } from "@/lib/home-merchandising";

export const dynamic = "force-dynamic";

function selectNewProducts<T extends { createdAt?: string }>(products: T[], limit: number) {
  return [...products]
    .sort((left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""))
    .slice(0, limit);
}

export default async function Home() {
  const catalog = await fetchCatalogList();
  const popularProducts = orderMerchandisingProducts(catalog.items, "popular").slice(0, 8);
  const newProducts = selectNewProducts(catalog.items, 4);

  return (
    <main id="main-content">
      <Hero products={catalog.items} />
      <Categories />
      <ProductCollection products={popularProducts} />
      <SteamTopUp />
      <CoinConverter />
      <NewProducts products={newProducts} />
      <HowItWorks />
      <FAQAccordion />
    </main>
  );
}
