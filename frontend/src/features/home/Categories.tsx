import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/ui/UI";
import { categories } from "@/data/home";

import styles from "./home.module.css";

export function Categories() {
  return (
    <Section id="categories">
      <Container>
        <SectionHeading title="Что вы ищете?" description="Выберите категорию или воспользуйтесь поиском." />
        <div className={styles.categoryGrid}>
          {categories.map((category) => (
            <Link key={category.id} href={category.href} className={`${styles.categoryCard} ${styles[category.id]}`}>
              <div className={styles.categoryCopy}>
                <span className={styles.categoryType}>
                  {category.id === "steam" ? "STEAM WALLET" : category.id === "skins" ? "CS2 / DOTA 2" : "DIGITAL ACCESS"}
                </span>
                <h3>{category.title}</h3>
                <p>{category.description}</p>
                <span className={styles.categoryAction}>
                  {category.action}
                  <Icon name="arrow" width="17" height="17" />
                </span>
              </div>
              <div className={styles.categoryVisual} aria-hidden="true">
                {category.id === "steam" ? (
                  <Icon name="steam" width="82" height="82" />
                ) : category.id === "skins" ? (
                  <span className={styles.weaponGlyph}>AK</span>
                ) : (
                  <span className={styles.gptGlyph}>GPT</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </Section>
  );
}
