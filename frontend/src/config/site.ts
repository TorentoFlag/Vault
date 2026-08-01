import type { CoinConfig } from "@/types/commerce";

export function publicAssetPath(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}

export const siteConfig = {
  name: "Vault",
  description: "Маркетплейс Steam, игровых предметов и цифровых товаров.",
  coin: {
    name: "Coins",
    rate: 1.5,
    fiat: "RUB",
  } satisfies CoinConfig,
  notice: "Все товары и операции оплачиваются в Coins. Для игровых предметов требуется Steam.",
  support: {
    email: "support@vaultapp24.com",
    hours: "Ежедневно, 10:00–22:00 (МСК)",
  },
  paymentMethods: [
    { name: "СБП", src: "/payments/sbp.svg" },
  ] as const,
  valveDisclaimer:
    "Наш сайт не связан, не аффилирован и не одобрен Valve Corporation или Steam.",
} as const;
