import type { Product } from "./commerce";

export type OrderStatus = "completed" | "processing" | "cancelled";
export type OrderDeliveryStatus = "delivered" | "inventory-ready" | "pending";

export type OrderItemSnapshot = {
  id: string;
  productId: string;
  slug: string;
  title: string;
  kind: Product["kind"];
  priceCoins: number;
  fulfillmentMode: Product["fulfillmentMode"];
  deliveryStatus: OrderDeliveryStatus;
  image?: string;
  imageAlt?: string;
};

export type MarketplaceOrder = {
  id: string;
  number: string;
  createdAt: string;
  items: OrderItemSnapshot[];
  totalCoins: number;
  status: OrderStatus;
  isDemo: boolean;
  recipient?: {
    steamLogin?: string;
    gptEmail?: string;
    steamTradeUrl?: string;
  };
};

export type CoinTransaction = {
  id: string;
  createdAt: string;
  direction: "credit" | "debit";
  reason: "top-up" | "purchase" | "sale";
  amountCoins: number;
  balanceAfterCoins: number;
  status: "completed" | "failed";
  orderNumber?: string;
  description: string;
  isDemo: boolean;
};

export type TradeEvent = {
  id: string;
  createdAt: string;
  direction: "purchase" | "sale" | "withdrawal";
  title: string;
  itemId?: string;
  orderNumber?: string;
  status: "completed" | "processing" | "pending";
};

export type SteamSettings = {
  tradeUrl: string;
};

export type InventoryItem = OrderItemSnapshot & {
  orderId: string;
  orderNumber: string;
  acquiredAt: string;
};
