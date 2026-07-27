import { newProducts, popularProducts } from "@/data/home";
import { Categories } from "@/features/home/Categories";
import { CoinConverter } from "@/features/home/CoinConverter";
import { FAQAccordion } from "@/features/home/FAQAccordion";
import { Hero } from "@/features/home/Hero";
import { HowItWorks } from "@/features/home/HowItWorks";
import { NewProducts } from "@/features/home/NewProducts";
import { ProductCollection } from "@/features/home/ProductCollection";
import { SteamTopUp } from "@/features/home/SteamTopUp";

export default function Home() {
  return (
    <main id="main-content">
      <Hero />
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
