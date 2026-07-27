import { Container, Section, SectionHeading } from "@/components/ui/UI";
import { orderSteps } from "@/data/home";

import styles from "./home.module.css";

export function HowItWorks() {
  return (
    <Section id="how-to-order" className={styles.stepsSection}>
      <Container>
        <SectionHeading title="Как оформить заказ" description="Выберите товар, проверьте данные, оплатите Coins и получите заказ." />
        <ol className={styles.steps}>
          {orderSteps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
