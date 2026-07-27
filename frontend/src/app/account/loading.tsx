import { Skeleton } from "@/components/ui/UI";
import styles from "@/features/account/account.module.css";

export default function AccountLoading() {
  return <Skeleton className={styles.routeSkeleton} />;
}
