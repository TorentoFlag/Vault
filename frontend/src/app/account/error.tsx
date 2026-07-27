"use client";

import Link from "next/link";

import { Button } from "@/components/ui/UI";
import styles from "@/features/account/account.module.css";

export default function AccountError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className={styles.routeError} aria-labelledby="account-error-title">
      <span>Ошибка раздела</span>
      <h2 id="account-error-title">Не удалось открыть кабинет</h2>
      <p>Данные аккаунта сохранены. Повторите загрузку или вернитесь в каталог.</p>
      <div><Button type="button" onClick={reset}>Повторить</Button><Link href="/catalog">В каталог</Link></div>
    </section>
  );
}
