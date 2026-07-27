import type { ProductKind } from "@/lib/marketplace";

export type ProductAvailability = "available" | "on-request";
export type ProductFulfillmentMode = "automatic" | "steam-trade" | "manual";

export type ProductSpecification = {
  label: string;
  value: string;
};

export type ProductFulfillmentDetails = {
  title: string;
  description: string;
  requirements: string[];
};

export type ProductDetails = {
  specifications: ProductSpecification[];
  fulfillment: ProductFulfillmentDetails;
};

export type Product = {
  id: string;
  slug: string;
  kind: ProductKind;
  category: string;
  game?: string;
  productType: string;
  title: string;
  description: string;
  priceCoins: number;
  availability: ProductAvailability;
  fulfillmentMode: ProductFulfillmentMode;
  createdAt: string;
  popularity: number;
  isMock: true;
  image?: string;
  imageAlt?: string;
  meta: string[];
  keywords?: string[];
  details: ProductDetails;
};

export type Category = {
  id: ProductKind;
  title: string;
  description: string;
  action: string;
  href: string;
};

export type FAQ = {
  id: string;
  group: "Безопасность" | "Steam" | "Возвраты";
  question: string;
  answer: string;
};

export type CoinConfig = {
  name: string;
  rate: number;
  fiat: "RUB";
};
