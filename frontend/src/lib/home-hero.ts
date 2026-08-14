import type { Product } from "@/types/commerce";

export type HomeHeroQuickSearch = {
  title: string;
  description?: string;
  href: string;
};

export type HomeHeroModel = {
  signalLabels: string[];
  subtitle: string;
  quickSearches: HomeHeroQuickSearch[];
  heroCards: Product[];
};

export function buildHomeHeroModel(products: Product[]): HomeHeroModel {
  const appleCard = products.find((product) => product.kind === "apple_gift_card");
  const skinProducts = products.filter((product) => product.kind === "skins");
  const steam = products.find((product) => product.kind === "steam");
  const heroCards = [
    appleCard,
    skinProducts[0],
    skinProducts[1] ?? steam,
  ].filter((product): product is Product => Boolean(product));

  return {
    signalLabels: ["Steam marketplace", "подарочные карты Apple", "Игровые предметы"],
    subtitle: "Подарочные карты Apple, пополнение Steam, покупка игровых предметов с ценами в Coins.",
    quickSearches: [
      {
        title: "Подарочные карты apple",
        description: "Приобретайте подарочные карты App Store & iTunes для пополнения баланса Apple ID",
        href: "/catalog?category=apple_gift_card",
      },
      { title: "Steam", href: "/catalog?category=steam" },
      { title: "CS2", href: "/catalog?category=skins&game=cs2" },
      { title: "Rust", href: "/catalog?category=skins&game=rust" },
      { title: "Team Fortress 2", href: "/catalog?category=skins&game=tf2" },
    ],
    heroCards,
  };
}
