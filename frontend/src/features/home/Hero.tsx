import Link from "next/link";

import { ProductCard } from "@/components/marketplace/ProductCard";
import { Container } from "@/components/ui/UI";
import type { Product } from "@/types/commerce";

import styles from "./home.module.css";

export function Hero({ products }: { products: Product[] }) {
  const skinProducts = products.filter((product) => product.kind === "skins");
  const steam = products.find((product) => product.kind === "steam");
  const heroCards = [
    skinProducts[0],
    steam,
    skinProducts[1],
  ].filter((product): product is Product => Boolean(product));

  return (
    <section className={styles.hero} id="top">
      <Container className={styles.heroGrid}>
        <div className={styles.heroContent}>
          <div className={styles.heroSignal}>
            <span>Steam Marketplace</span>
            <span>Игровые предметы</span>
            <span>Coins</span>
          </div>
          <h1>Цифровые товары для игр и сервисов</h1>
          <p>
            Выбирайте пополнение Steam и игровые предметы с ценами в Coins.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryLink} href="/catalog">Перейти в каталог</Link>
          </div>
          <nav className={styles.quickSearches} aria-label="Популярные категории">
            <Link href="/catalog?category=steam">Steam</Link>
            <Link href="/catalog?category=skins&q=CS2">CS2</Link>
            <Link href="/catalog?q=Пистолет">Пистолет</Link>
            <Link href="/catalog?q=Автомат">Автомат</Link>
          </nav>
        </div>
        <div className={styles.inventory} aria-label="Товары из каталога">
          <div className={styles.inventoryHeader}>
            <span>Предложения каталога</span>
            <strong>Steam &amp; CS2</strong>
          </div>
          <div className={styles.inventoryGrid}>
            {heroCards.map((product, index) => (
              <ProductCard key={product.id} product={product} compact priority={index < 2} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
