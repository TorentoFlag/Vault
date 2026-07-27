import { Container, Skeleton } from "@/components/ui/UI";

import styles from "@/features/product/product.module.css";

export default function ProductLoading() {
  return (
    <main id="main-content" className={styles.productPage} aria-busy="true" aria-label="Загрузка товара">
      <Container>
        <Skeleton className={styles.loadingBreadcrumbs} />
        <div className={styles.loadingProductLayout}>
          <div className={styles.loadingMainColumn}>
            <Skeleton className={styles.loadingMedia} />
            <div className={styles.loadingInformation}>
              <Skeleton /><Skeleton />
            </div>
          </div>
          <div className={styles.loadingPurchase}>
            <Skeleton className={styles.loadingLabel} />
            <Skeleton className={styles.loadingTitle} />
            <Skeleton className={styles.loadingText} />
            <Skeleton className={styles.loadingMeta} />
            <Skeleton className={styles.loadingPrice} />
            <Skeleton className={styles.loadingButton} />
            <Skeleton className={styles.loadingReceipt} />
          </div>
        </div>
      </Container>
    </main>
  );
}
