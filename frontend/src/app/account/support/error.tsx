"use client";

import Link from "next/link";

import { Button } from "@/components/ui/UI";
import styles from "@/features/account/account.module.css";

export default function SupportError({ reset }: { reset: () => void }) {
  return (
    <section className={styles.routeError} role="alert">
      <span>Поддержка</span>
      <h2>Не удалось открыть форму</h2>
      <p>Данные обращения сохранены. Попробуйте загрузить раздел ещё раз.</p>
      <div><Button type="button" onClick={reset}>Повторить</Button><Link href="/account">В кабинет</Link></div>
    </section>
  );
}
