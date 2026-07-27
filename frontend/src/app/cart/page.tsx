import type { Metadata } from "next";

import { CartScreen } from "@/features/cart/CartScreen";

export const metadata: Metadata = {
  title: "Корзина — Vault",
  description: "Проверьте цифровые товары и баланс Coins перед оформлением заказа.",
};

export default function CartPage() {
  return <CartScreen />;
}
