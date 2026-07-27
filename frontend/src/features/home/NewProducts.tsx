"use client";

import Image from "next/image";
import Link from "next/link";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Button, Container, Section, SectionHeading, StatusBadge } from "@/components/ui/UI";
import { publicAssetPath } from "@/config/site";
import { getProductStatusLabel } from "@/lib/catalog";
import { getProductVisualLabel } from "@/lib/product-visual";
import type { Product } from "@/types/commerce";

import styles from "./home.module.css";

export function NewProducts({ products }: { products: Product[] }) {
  const { cart, addToCart } = useMarketplace();

  return (
    <Section id="new-products">
      <Container>
        <SectionHeading title="Новое в каталоге" description="Недавно добавленные категории и товары." />
        <div className={styles.newList}>
          {products.map((product) => {
            const selected = cart.some((item) => item.id === product.id);
            return (
              <article key={product.id} className={styles.newItem}>
                <Link className={styles.newThumb} href={`/catalog/${product.slug}`} aria-hidden="true" tabIndex={-1}>
                  {product.image ? (
                    <Image src={publicAssetPath(product.image)} alt={product.imageAlt ?? product.title} fill sizes="92px" />
                  ) : (
                    <span>{getProductVisualLabel(product)}</span>
                  )}
                </Link>
                <div className={styles.newCopy}>
                  <span>{product.category}</span>
                  <h3><Link href={`/catalog/${product.slug}`}>{product.title}</Link></h3>
                  <p>{product.description}</p>
                </div>
                <div className={styles.newStatus}>
                  <StatusBadge tone={product.availability === "on-request" ? "warning" : "success"}>
                    {getProductStatusLabel(product)}
                  </StatusBadge>
                </div>
                <div className={styles.newPrice}><strong>{product.priceCoins.toLocaleString("ru-RU")}</strong><span>Coins</span></div>
                <Button
                  type="button"
                  tone={selected ? "secondary" : "primary"}
                  disabled={selected}
                  onClick={() => { void addToCart({ id: product.id, title: product.title }); }}
                >
                  {selected ? "Добавлено" : "В корзину"}
                </Button>
              </article>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
