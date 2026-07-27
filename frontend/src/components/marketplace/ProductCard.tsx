"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button, StatusBadge } from "@/components/ui/UI";
import { Icon } from "@/components/ui/Icon";
import { publicAssetPath } from "@/config/site";
import { getCatalogScrollStorageKey, getProductStatusLabel, shouldStoreCatalogScroll } from "@/lib/catalog";
import type { Product } from "@/types/commerce";

import { useMarketplace } from "./MarketplaceProvider";
import styles from "./marketplace.module.css";

function ProductVisual({ product, priority = false }: { product: Product; priority?: boolean }) {
  if (product.image) {
    return (
      <Image
        src={publicAssetPath(product.image)}
        alt={product.imageAlt ?? product.title}
        fill
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        sizes="(max-width: 680px) 78vw, (max-width: 1080px) 42vw, 260px"
      />
    );
  }

  const isSteam = product.kind === "steam";
  const visualLabel = product.kind === "skins" ? product.game ?? "SKIN" : "GPT";
  const visualCaption = product.kind === "skins" ? "Steam item" : "Digital access";

  return (
    <div className={`${styles.serviceVisual} ${styles[product.kind]}`} aria-hidden="true">
      {isSteam ? <Icon name="steam" width="54" height="54" /> : <span>{visualLabel}</span>}
      <small>{isSteam ? "Steam Wallet" : visualCaption}</small>
    </div>
  );
}

export function ProductCard({
  product,
  compact = false,
  priority = false,
  headingLevel = 3,
  returnHref,
}: {
  product: Product;
  compact?: boolean;
  priority?: boolean;
  headingLevel?: 2 | 3;
  returnHref?: string;
}) {
  const { cart, addToCart } = useMarketplace();
  const pathname = usePathname();
  const selected = cart.some((item) => item.id === product.id);
  const ProductTitle = `h${headingLevel}` as "h2" | "h3";
  const detailHref = returnHref ? `/catalog/${product.slug}?returnTo=${encodeURIComponent(returnHref)}` : `/catalog/${product.slug}`;

  function rememberCatalogPosition() {
    if (!returnHref || !shouldStoreCatalogScroll(pathname, returnHref)) return;
    try {
      window.sessionStorage.setItem(getCatalogScrollStorageKey(returnHref), String(window.scrollY));
    } catch { /* Navigation remains available when storage is blocked. */ }
  }

  return (
    <article className={`${styles.productCard} ${compact ? styles.compactCard : ""}`}>
      <div className={styles.productMedia}>
        <span className={styles.productCategory}>{product.category}</span>
        <Link
          className={styles.productVisualLink}
          href={detailHref}
          onClick={rememberCatalogPosition}
          aria-hidden="true"
          tabIndex={-1}
        >
          <ProductVisual product={product} priority={priority} />
        </Link>
      </div>
      <div className={styles.productBody}>
        <div className={styles.productMeta}>
          {product.meta.slice(0, compact ? 2 : 3).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <ProductTitle>
          <Link className={styles.productTitleLink} href={detailHref} onClick={rememberCatalogPosition}>
            {product.title}
          </Link>
        </ProductTitle>
        {!compact ? <p>{product.description}</p> : null}
        <div className={styles.productState}>
          <StatusBadge tone={product.availability === "on-request" ? "warning" : "success"}>
            {getProductStatusLabel(product)}
          </StatusBadge>
        </div>
        <div className={styles.productFooter}>
          <div className={styles.price}>
            <strong>{product.priceCoins.toLocaleString("ru-RU")}</strong>
            <span>Coins</span>
          </div>
          <Button
            tone={selected ? "secondary" : "primary"}
            type="button"
            onClick={() => { void addToCart({ id: product.id, title: product.title }); }}
            disabled={selected}
          >
            {selected ? "Добавлено" : "В корзину"}
          </Button>
        </div>
      </div>
    </article>
  );
}
