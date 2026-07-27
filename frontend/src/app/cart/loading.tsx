import { Container, Skeleton } from "@/components/ui/UI";

import styles from "@/features/cart/cart.module.css";

export default function CartLoading() {
  return (
    <main id="main-content" className={styles.cartPage} aria-label="Загрузка корзины">
      <Container>
        <Skeleton className={styles.breadcrumbSkeleton} />
        <Skeleton className={styles.titleSkeleton} />
        <div className={styles.cartLayout}>
          <Skeleton className={styles.listSkeleton} />
          <Skeleton className={styles.summarySkeleton} />
        </div>
      </Container>
    </main>
  );
}
