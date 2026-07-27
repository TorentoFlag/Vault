import Link from "next/link";

import { Container } from "@/components/ui/UI";

import styles from "@/features/product/product.module.css";

export default function ProductNotFound() {
  return (
    <main id="main-content" className={styles.productPage}>
      <Container>
        <div className={styles.statePanel}>
          <span>404 / Каталог</span>
          <h1>Товар не найден</h1>
          <p>Возможно, товар был перемещён или ссылка указана неверно.</p>
          <div className={styles.stateActions}>
            <Link className={styles.primaryStateLink} href="/catalog">Открыть каталог</Link>
            <Link href="/">На главную</Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
