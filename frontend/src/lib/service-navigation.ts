import type { IconName } from "@/components/ui/Icon";

export type ServiceNavigationItem = {
  label: string;
  href: string;
  icon: IconName;
};

export const serviceNavigation: ServiceNavigationItem[] = [
  { label: "Все товары", href: "/catalog", icon: "bag" },
  { label: "Пополнение Steam", href: "/catalog?category=steam", icon: "steam" },
  { label: "Подарочные карты Apple", href: "/catalog?category=apple_gift_card", icon: "bag" },
  { label: "Скины CS2", href: "/catalog?category=skins&game=cs2", icon: "shield" },
  { label: "Скины Rust", href: "/catalog?category=skins&game=rust", icon: "shield" },
  { label: "Скины TF2", href: "/catalog?category=skins&game=tf2", icon: "shield" },
  { label: "Пополнить Coins", href: "/balance/top-up", icon: "coin" },
];

export function getServiceNavigationHref(item: ServiceNavigationItem, isSignedIn: boolean) {
  return item.href === "/balance/top-up" && !isSignedIn
    ? "/auth?returnTo=%2Fbalance%2Ftop-up"
    : item.href;
}
