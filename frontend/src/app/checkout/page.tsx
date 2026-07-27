import type { Metadata } from "next";

import { CheckoutScreen } from "@/features/checkout/CheckoutScreen";

export const metadata: Metadata = {
  title: "Оформление заказа — Vault",
  description: "Проверка товаров, баланса Coins и условий получения перед оформлением заказа.",
};

export default function CheckoutPage() {
  return <CheckoutScreen />;
}
