"use client";

import Link from "next/link";

import { Container } from "@/components/ui/UI";

import styles from "@/features/auth/auth.module.css";

export default function AuthError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main-content" className={styles.page}>
      <Container>
        <div className={styles.errorBoundary} role="alert">
          <span>Аккаунт Vault</span>
          <h1>Не удалось открыть вход</h1>
          <p>Корзина и баланс сохранены. Попробуйте загрузить форму ещё раз.</p>
          <div>
            <button type="button" onClick={reset}>Повторить</button>
            <Link href="/cart">Вернуться в корзину</Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
