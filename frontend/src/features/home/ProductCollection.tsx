"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ProductCard } from "@/components/marketplace/ProductCard";
import { Icon } from "@/components/ui/Icon";
import { Container, Section, SectionHeading } from "@/components/ui/UI";
import { createPopularGridEntries, getMerchandisingCopy, orderMerchandisingProducts } from "@/lib/home-merchandising";
import type { ProductFilter } from "@/lib/marketplace";
import type { Product } from "@/types/commerce";

import styles from "./home.module.css";

const categoryFilters: { value: ProductFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "steam", label: "Steam" },
  { value: "gpt", label: "GPT" },
  { value: "skins", label: "Игровые предметы" },
];

type MerchandisingFilter = "popular" | "bestsellers" | "new";

export function ProductCollection({ products }: { products: Product[] }) {
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [merchandising, setMerchandising] = useState<MerchandisingFilter>("popular");
  const merchandisedProducts = useMemo(() => {
    return orderMerchandisingProducts(products, merchandising);
  }, [merchandising, products]);
  const entries = useMemo(() => createPopularGridEntries(merchandisedProducts, filter), [filter, merchandisedProducts]);
  const collectionCopy = getMerchandisingCopy(merchandising);

  return (
    <Section id="popular-products" className={styles.catalogSection}>
      <Container>
        <SectionHeading
          title={collectionCopy.title}
          description={collectionCopy.description}
          action={
            <div className={styles.filterGroups}>
              <div className={styles.filterGroup} role="group" aria-label="Подборка товаров">
                <span className={styles.filterGroupLabel}>Подборка</span>
                <div className={styles.filterButtons}>
                  {[
                { value: "popular" as const, label: "Популярное" },
                { value: "bestsellers" as const, label: "Бестселлеры" },
                { value: "new" as const, label: "Новинки" },
                  ].map((item) => (
                    <button key={item.value} type="button" className={merchandising === item.value ? styles.activeFilter : ""} aria-pressed={merchandising === item.value} onClick={() => setMerchandising(item.value)}>{item.label}</button>
                  ))}
                </div>
              </div>
              <div className={styles.filterGroup} role="group" aria-label="Категория товаров">
                <span className={styles.filterGroupLabel}>Категория</span>
                <div className={styles.filterButtons}>
                  {categoryFilters.map((item) => (
                    <button key={item.value} type="button" className={filter === item.value ? styles.activeFilter : ""} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>
                  ))}
                </div>
              </div>
            </div>
          }
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
