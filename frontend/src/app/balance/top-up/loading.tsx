import { Container, Skeleton } from "@/components/ui/UI";

import styles from "@/features/top-up/top-up.module.css";

export default function TopUpLoading() {
  return (
    <main id="main-content" className={styles.page} aria-label="Загрузка пополнения баланса">
      <Container>
        <Skeleton className={styles.breadcrumbSkeleton} />
        <Skeleton className={styles.titleSkeleton} />
        <div className={styles.layout}>
          <Skeleton className={styles.formSkeleton} />
          <Skeleton className={styles.summarySkeleton} />
        </div>
      </Container>
    </main>
  );
}
