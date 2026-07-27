import Link from "next/link";
import Image from "next/image";

import { Icon } from "@/components/ui/Icon";
import { publicAssetPath, siteConfig } from "@/config/site";

import styles from "./layout.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerMain}>
        <div className={styles.footerBrand}>
          <Link className={styles.logo} href="/">
            <span className={styles.logoMark}>V</span>
            <span>VAULT</span>
          </Link>
          <p>Цифровые товары для игр и сервисов.</p>
          <span className={styles.age}>18+</span>
        </div>
        <div className={styles.footerColumn}>
          <h2>Навигация</h2>
          <Link href="/catalog">Каталог</Link>
          <Link href="/#popular-products">Популярные товары</Link>
          <Link href="/#steam-top-up">Пополнение Steam</Link>
          <Link href="/#new-products">Новинки</Link>
        </div>
        <div className={styles.footerColumn}>
          <h2>Поддержка</h2>
          <Link href="/account/support">Поддержка</Link>
          <Link href="/#faq">FAQ</Link>
          <a href={`mailto:${siteConfig.support.email}`}>{siteConfig.support.email}</a>
          <span>{siteConfig.support.hours}</span>
        </div>
        <div className={styles.footerColumn}>
          <h2>Оплата и получение</h2>
          <div className={styles.paymentMethods} aria-label="Платёжные системы">
            {siteConfig.paymentMethods.map((method) => (
              <span className={styles.paymentLogo} key={method.name} title={method.name}>
                <Image src={publicAssetPath(method.src)} alt={method.name} width={38} height={22} />
              </span>
            ))}
          </div>
          <p>Проведение оплаты пока не подключено. Цены каталога указаны в Coins.</p>
        </div>
        <div className={styles.footerColumn}>
          <h2>Реквизиты</h2>
          <p>Наименование компании</p>
          <p>ИНН</p>
          <p>Юридический адрес</p>
          <p>Контакты: {siteConfig.support.email}</p>
        </div>
        <div className={styles.footerColumn}>
          <h2>Документы</h2>
          <Link href="/legal/terms">Пользовательское соглашение</Link>
          <Link href="/legal/privacy">Политика конфиденциальности</Link>
          <Link href="/legal/refund">Политика возвратов</Link>
          <Link href="/legal/provably-fair">Provably Fair</Link>
        </div>
      </div>
      <div className={styles.disclaimer}>
        <Icon name="shield" width="20" height="20" />
        <p>{siteConfig.valveDisclaimer}</p>
      </div>
      <div className={styles.footerBottom}>
        <span>© 2026 Vault</span>
        <span>{siteConfig.notice}</span>
      </div>
    </footer>
  );
}
