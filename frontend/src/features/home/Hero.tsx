import Link from "next/link";

import { ProductCard } from "@/components/marketplace/ProductCard";
import { Container } from "@/components/ui/UI";
import { buildHomeHeroModel } from "@/lib/home-hero";
import type { Product } from "@/types/commerce";

import styles from "./home.module.css";

export function Hero({ products }: { products: Product[] }) {
  const hero = buildHomeHeroModel(products);

  return (
    <section className={styles.hero} id="top">
      <Container className={styles.heroGrid}>
        <div className={styles.heroContent}>
          <div className={styles.heroSignal}>
            {hero.signalLabels.map((label) => <span key={label}>{label}</span>)}
          </div>
          <h1>Цифровые товары для игр и сервисов</h1>
          <p>{hero.subtitle}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryLink} href="/catalog">Перейти в каталог</Link>
          </div>
          <nav className={styles.quickSearches} aria-label="Популярные категории">
            {hero.quickSearches.map((item) => (
              <Link
                key={item.href}
                className={item.description ? styles.quickSearchFeatured : undefined}
                href={item.href}
              >
                <strong>{item.title}</strong>
                {item.description ? <span>{item.description}</span> : null}
              </Link>
            ))}
          </nav>
        </div>
        <div className={styles.inventory} aria-label="Товары из каталога">
          <div className={styles.inventoryHeader}>
            <span>Предложения каталога</span>
            <strong>Apple &amp; CS2</strong>
          </div>
          <div className={styles.inventoryGrid}>
            {hero.heroCards.map((product, index) => (
              <ProductCard key={product.id} product={product} compact priority={index < 2} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
