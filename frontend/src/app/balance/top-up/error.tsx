"use client";

import Link from "next/link";

import { Container } from "@/components/ui/UI";

import styles from "@/features/top-up/top-up.module.css";

export default function TopUpError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main-content" className={styles.page}>
      <Container>
        <div className={styles.errorState} role="alert">
          <span>Пополнение баланса</span>
          <h1>Не удалось открыть форму</h1>
          <p>Баланс не изменился. Попробуйте загрузить форму ещё раз.</p>
          <div>
            <button type="button" onClick={reset}>Повторить</button>
            <Link href="/cart">Вернуться в корзину</Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
