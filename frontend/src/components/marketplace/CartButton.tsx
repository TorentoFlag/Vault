"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/Icon";

import { useMarketplace } from "./MarketplaceProvider";
import styles from "./marketplace.module.css";

export function CartButton() {
  const { cart } = useMarketplace();
  const pathname = usePathname();
  const isCurrent = pathname === "/cart";

  return (
    <div className={styles.cartWrap}>
      <Link
        className={`${styles.headerAction} ${isCurrent ? styles.headerActionActive : ""}`}
        href="/cart"
        aria-label={`Корзина, товаров: ${cart.length}`}
        aria-current={isCurrent ? "page" : undefined}
      >
        <Icon name="bag" width="21" height="21" />
        <span className={styles.actionLabel}>Корзина</span>
        <span className={styles.cartCount}>{cart.length}</span>
      </Link>
    </div>
  );
}
