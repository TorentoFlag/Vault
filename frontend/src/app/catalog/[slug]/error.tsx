"use client";

import Link from "next/link";

import { Button, Container } from "@/components/ui/UI";

import styles from "@/features/product/product.module.css";

export default function ProductError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main-content" className={styles.productPage}>
      <Container>
        <div className={styles.statePanel} role="alert">
          <span>Ошибка загрузки</span>
          <h1>Не удалось открыть товар</h1>
          <p>Повторите попытку или вернитесь в каталог.</p>
          <div className={styles.stateActions}>
            <Button type="button" onClick={reset}>Попробовать снова</Button>
            <Link href="/catalog">Вернуться в каталог</Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
