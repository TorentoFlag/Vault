import Link from "next/link";

import { Breadcrumbs, Container } from "@/components/ui/UI";
import { getLegalDocument, legalDocuments, type LegalDocumentId } from "@/config/legal";

import styles from "./legal-shell.module.css";

export function LegalDocumentShell({
  documentId,
}: {
  documentId: LegalDocumentId;
}) {
  const document = getLegalDocument(documentId);

  return (
    <main id="main-content" className={styles.page}>
      <Container>
        <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Документы" }, { label: document.title }]} />
        <div className={styles.legalLayout}>
          <aside className={styles.documentNav} aria-label="Юридические документы">
            <span>Документы Vault</span>
            <nav>
              {legalDocuments.map((item) => <Link key={item.id} href={item.href} aria-current={item.id === documentId ? "page" : undefined}><strong>{item.title}</strong><small>{item.shortTitle}</small></Link>)}
            </nav>
            <p>Условия действий, доступных в текущей версии Vault.</p>
          </aside>

          <article className={styles.document}>
            <header>
              <div><span>{document.shortTitle}</span><h1>{document.title}</h1></div>
              <strong className={styles.status}>Актуально для этой версии</strong>
            </header>

            <dl className={styles.documentMeta}>
              <div><dt>Область действия</dt><dd>Локальная версия Vault в браузере</dd></div>
            </dl>

            <section className={styles.pendingNotice}>
              <span aria-hidden="true">V</span>
              <div><h2>Основные положения</h2><p>{document.summary}</p></div>
            </section>

            {document.sections.map((section) => (
              <section className={styles.demoFacts} key={section.title}>
                <h2>{section.title}</h2>
                <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
            ))}

            <footer className={styles.documentFooter}>
              <p>Если вопрос связан с заказом, укажите его номер при обращении в поддержку.</p>
              <div><Link className={styles.primaryLink} href="/account/support">Открыть поддержку</Link><Link href="/catalog">Вернуться в каталог</Link></div>
            </footer>
          </article>
        </div>
      </Container>
    </main>
  );
}
