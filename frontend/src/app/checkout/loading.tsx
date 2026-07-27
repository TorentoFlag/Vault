import { Container, Skeleton } from "@/components/ui/UI";
import styles from "@/features/checkout/checkout.module.css";

export default function CheckoutLoading() {
  return <main id="main-content" className={styles.page} aria-label="Загрузка оформления заказа"><Container><Skeleton className={styles.itemsSkeleton} /><div className={styles.checkoutLayout}><Skeleton className={styles.itemsSkeleton} /><Skeleton className={styles.summarySkeleton} /></div></Container></main>;
}
