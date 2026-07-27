"use client";

import Link from "next/link";

import { Container } from "@/components/ui/UI";

import styles from "@/features/cart/cart.module.css";

export default function CartError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main-content" className={styles.cartPage}>
      <Container>
        <div className={styles.statePanel} role="alert">
          <span>Корзина</span>
          <h1>Не удалось открыть корзину</h1>
          <p>Товары сохранены. Попробуйте загрузить раздел ещё раз.</p>
          <div className={styles.stateActions}>
            <button type="button" onClick={reset}>Повторить</button>
            <Link href="/catalog">Вернуться в каталог</Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
