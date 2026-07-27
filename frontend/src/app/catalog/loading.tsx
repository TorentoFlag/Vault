import { Container, Skeleton } from "@/components/ui/UI";

import styles from "@/features/catalog/catalog.module.css";

export function CatalogLoading() {
  return (
    <main id="main-content" className={styles.catalogPage} aria-busy="true" aria-label="Загрузка каталога">
      <Container>
        <div className={styles.loadingIntro}>
          <Skeleton className={styles.loadingBreadcrumbs} />
          <Skeleton className={styles.loadingTitle} />
          <Skeleton className={styles.loadingText} />
        </div>
        <div className={styles.loadingTabs}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className={styles.loadingTab} />
          ))}
        </div>
        <div className={styles.loadingLayout}>
          <Skeleton className={styles.loadingSidebar} />
          <div className={styles.loadingGrid}>
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className={styles.loadingCard}>
                <Skeleton className={styles.loadingMedia} />
                <Skeleton className={styles.loadingLine} />
                <Skeleton className={styles.loadingLineShort} />
              </div>
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}

export default CatalogLoading;
