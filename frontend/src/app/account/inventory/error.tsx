"use client";

import { Button } from "@/components/ui/UI";
import styles from "@/features/account/account.module.css";

export default function InventoryError({ reset }: { reset: () => void }) {
  return (
    <section className={`${styles.panel} ${styles.inventoryError}`} role="alert">
      <span>Инвентарь</span>
      <h2>Не удалось показать предметы</h2>
      <p>Данные инвентаря сохранены. Попробуйте загрузить раздел ещё раз.</p>
      <Button type="button" onClick={reset}>Повторить</Button>
    </section>
  );
}
