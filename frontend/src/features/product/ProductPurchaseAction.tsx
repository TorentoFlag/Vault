"use client";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Button } from "@/components/ui/UI";
import type { Product } from "@/types/commerce";

import styles from "./product.module.css";
import { CatalogReturnLink } from "./CatalogReturnLink";

export function ProductPurchaseAction({ product }: { product: Product }) {
  const { cart, addToCart } = useMarketplace();
  const selected = cart.some((item) => item.id === product.id);

  return (
    <div className={styles.purchaseActions}>
      <Button
        className={styles.addButton}
        type="button"
        disabled={selected}
        onClick={() => { void addToCart({ id: product.id, title: product.title }); }}
      >
        {selected ? "Добавлено в корзину" : "Добавить в корзину"}
      </Button>
      <CatalogReturnLink className={styles.backLink} />
    </div>
  );
}
