import { Container, Skeleton } from "@/components/ui/UI";

import styles from "@/features/auth/auth.module.css";

export default function AuthLoading() {
  return (
    <main id="main-content" className={styles.page} aria-label="Загрузка авторизации">
      <Container>
        <Skeleton className={styles.breadcrumbSkeleton} />
        <Skeleton className={styles.titleSkeleton} />
        <div className={styles.layout}>
          <Skeleton className={styles.authSkeleton} />
          <Skeleton className={styles.contextSkeleton} />
        </div>
      </Container>
    </main>
  );
}
