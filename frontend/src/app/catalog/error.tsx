"use client";

import { Button, Container } from "@/components/ui/UI";

import styles from "@/features/catalog/catalog.module.css";

export default function CatalogError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main-content" className={styles.catalogPage}>
      <Container>
        <div className={styles.errorState} role="alert">
          <span>Ошибка загрузки каталога</span>
          <h1>Не удалось загрузить товары</h1>
          <p>Повторите попытку. Выбранные параметры каталога останутся в адресной строке.</p>
          <Button type="button" onClick={reset}>Попробовать снова</Button>
        </div>
      </Container>
    </main>
  );
}
