"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ProductCard } from "@/components/marketplace/ProductCard";
import { Icon } from "@/components/ui/Icon";
import { Container, Section, SectionHeading } from "@/components/ui/UI";
import { createPopularGridEntries, getMerchandisingCopy, orderMerchandisingProducts } from "@/lib/home-merchandising";
import type { Product } from "@/types/commerce";

import styles from "./home.module.css";

export function ProductCollection({ products }: { products: Product[] }) {
  const merchandisedProducts = useMemo(() => {
    return orderMerchandisingProducts(products, "popular");
  }, [products]);
  const entries = useMemo(() => createPopularGridEntries(merchandisedProducts, "all"), [merchandisedProducts]);
  const collectionCopy = getMerchandisingCopy("popular");

  return (
    <Section id="popular-products" className={styles.catalogSection}>
      <Container>
        <SectionHeading
          title={collectionCopy.title}
          description={collectionCopy.description}
        />
        {entries.length ? (
          <div className={styles.productGrid}>
            {entries.map((entry) => entry.type === "product" ? (
              <ProductCard key={entry.product.id} product={entry.product} />
            ) : (
              <article className={styles.catalogCtaCard} key="catalog-link">
                <Link href="/catalog">
                  <span className={styles.catalogCtaEyebrow}>Весь ассортимент</span>
                  <span className={styles.catalogCtaCopy}>
                    <strong>Посмотреть ещё</strong>
                    <span>Перейти к полному каталогу товаров</span>
                  </span>
                  <span className={styles.catalogCtaAction}>
                    Открыть каталог
                    <Icon name="arrow" width="18" height="18" />
                  </span>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>В этой категории пока нет товаров.</div>
        )}
      </Container>
    </Section>
  );
}
