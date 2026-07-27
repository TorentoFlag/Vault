import styles from "@/features/account/account.module.css";

export default function InventoryLoading() {
  return (
    <section className={`${styles.panel} ${styles.inventoryLoading}`} aria-live="polite" aria-busy="true">
      <span>Инвентарь</span>
      <h2>Загружаем предметы</h2>
      <p>Проверяем выполненные заказы и настройки Steam…</p>
    </section>
  );
}
