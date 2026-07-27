import Link from "next/link";

import { ProductCard } from "@/components/marketplace/ProductCard";
import { Container } from "@/components/ui/UI";
import { popularProducts } from "@/data/home";

import styles from "./home.module.css";

export function Hero() {
  const ak = popularProducts[0];
  const awp = popularProducts[1];
  const steam = popularProducts[4];

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
            Сравнивайте предложения Steam, GPT и игровых предметов с ценами в Coins. Оформление сохраняет локальный заказ; внешняя выдача пока не подключена.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryLink} href="/catalog">Перейти в каталог</Link>
          </div>
          <nav className={styles.quickSearches} aria-label="Популярные категории">
            <Link href="/catalog?category=steam">Steam</Link>
            <Link href="/catalog?category=skins&q=CS2">CS2</Link>
            <Link href="/catalog?category=skins&q=Dota%202">Dota 2</Link>
            <Link href="/catalog?category=gpt">GPT</Link>
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
            <ProductCard product={ak} compact priority />
            <ProductCard product={steam} compact priority />
            <ProductCard product={awp} compact />
          </div>
        </div>
      </Container>
    </section>
  );
}
