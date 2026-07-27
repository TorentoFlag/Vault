"use client";

import { useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { Container, Section, SectionHeading } from "@/components/ui/UI";
import { faqItems } from "@/data/home";

import styles from "./home.module.css";

export function FAQAccordion() {
  const groups = ["Безопасность", "Steam", "Возвраты"] as const;
  const [activeGroup, setActiveGroup] = useState<(typeof groups)[number]>(groups[0]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = groups.indexOf(activeGroup);
  const activeItems = faqItems.filter((item) => item.group === activeGroup);

  function selectTab(index: number) {
    const nextIndex = (index + groups.length) % groups.length;
    setActiveGroup(groups[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <Section id="faq" className={styles.faqSection}>
      <Container>
        <div className={styles.faqShell}>
          <SectionHeading title="FAQ" description="Ответы на вопросы об оплате, Steam и возвратах." />
          <div className={styles.faqTabs} role="tablist" aria-label="Разделы FAQ">
            {groups.map((group, index) => {
              const isActive = group === activeGroup;

              return (
                <button
                  key={group}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  type="button"
                  role="tab"
                  id={`faq-tab-${index}`}
                  aria-selected={isActive}
                  aria-controls={`faq-panel-${index}`}
                  tabIndex={isActive ? 0 : -1}
                  className={`${styles.faqTab} ${isActive ? styles.activeFaqTab : ""}`}
                  onClick={() => setActiveGroup(group)}
                  onKeyDown={(event) => {
                    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    if (event.key === "ArrowRight") selectTab(activeIndex + 1);
                    if (event.key === "ArrowLeft") selectTab(activeIndex - 1);
                    if (event.key === "Home") selectTab(0);
                    if (event.key === "End") selectTab(groups.length - 1);
                  }}
                >
                  {group}
                </button>
              );
            })}
          </div>
          <div
            className={styles.faqPanel}
            role="tabpanel"
            id={`faq-panel-${activeIndex}`}
            aria-labelledby={`faq-tab-${activeIndex}`}
          >
            {activeItems.map((item) => (
              <details key={item.id}>
                <summary>
                  <span>{item.question}</span>
                  <Icon name="chevron" width="18" height="18" />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
