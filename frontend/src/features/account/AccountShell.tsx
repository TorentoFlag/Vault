"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Breadcrumbs, Container, Skeleton } from "@/components/ui/UI";
import { createAccountAuthReturnPath } from "@/lib/auth";

import styles from "./account.module.css";

const accountNav = [
  { href: "/account", label: "Обзор", icon: "grid" },
  { href: "/account/purchases", label: "Мои покупки", icon: "bag" },
  { href: "/account/payments", label: "История платежей", icon: "coin" },
  { href: "/account/inventory", label: "Инвентарь", icon: "grid" },
  { href: "/account/steam", label: "Steam", icon: "steam" },
  { href: "/account/settings", label: "Настройки", icon: "user" },
  { href: "/account/support", label: "Поддержка", icon: "shield" },
] satisfies ReadonlyArray<{ href: string; label: string; icon: IconName }>;

const pageTitles: Record<string, { title: string; description: string }> = {
  "/account": { title: "Личный кабинет", description: "Локальные покупки, баланс Coins и настройки Steam в одном месте." },
  "/account/purchases": { title: "Мои покупки", description: "Все заказы, их статусы и доступные действия." },
  "/account/payments": { title: "История Coins", description: "Зачисления и списания внутреннего баланса Vault." },
  "/account/inventory": { title: "Инвентарь", description: "Предметы из выполненных заказов и настройка данных Steam." },
  "/account/steam": { title: "Steam", description: "Профиль и Steam Trade URL, сохранённые для заказов игровых предметов." },
  "/account/settings": { title: "Настройки", description: "Способы входа, безопасность и управление аккаунтом." },
  "/account/support": { title: "Поддержка", description: "Быстрые ответы и данные, которые понадобятся для обращения." },
};

function AccountLinks({ pathname }: { pathname: string }) {
  return (
    <nav className={styles.accountNav} aria-label="Разделы аккаунта">
      {accountNav.map((item) => (
        <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
          <span aria-hidden="true"><Icon name={item.icon} width="15" height="15" /></span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function AccountLoading() {
  return (
    <div className={styles.shellLayout} aria-label="Загрузка личного кабинета">
      <Skeleton className={styles.sidebarSkeleton} />
      <Skeleton className={styles.contentSkeleton} />
    </div>
  );
}

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { balanceCoins, session, isHydrated, isAuthenticated, hasSeedData } = useMarketplace();
  const page = pageTitles[pathname] ?? pageTitles["/account"];
  const displayName = session?.steamAccount?.displayName ?? session?.emailAccount?.displayName ?? "Покупатель";
  const nestedReturnTo = searchParams.get("returnTo");
  const returnTo = encodeURIComponent(createAccountAuthReturnPath(pathname, nestedReturnTo));

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace(`/auth?returnTo=${encodeURIComponent(createAccountAuthReturnPath(pathname, nestedReturnTo))}`);
    }
  }, [isAuthenticated, isHydrated, nestedReturnTo, pathname, router]);

  return (
    <main id="main-content" className={styles.page}>
      <Container>
        <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Аккаунт", href: "/account" }, ...(pathname === "/account" ? [] : [{ label: page.title }])]} />
        <div className={styles.pageHeading}>
          <span>Аккаунт Vault</span>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </div>
        <p className={styles.demoDisclosure}>
          <strong>Единый аккаунт</strong>
          Покупки, Coins, инвентарь и настройки Steam доступны в одном месте.
        </p>
        {isHydrated && isAuthenticated && hasSeedData ? (
          <p className={styles.demoDisclosure} role="note">
            <strong>Данные профиля</strong>
            История и баланс этого профиля сохранены только в текущем браузере. Внешние платежи и выдача не подключены.
          </p>
        ) : null}

        {!isHydrated ? <AccountLoading /> : !isAuthenticated ? (
          <section className={styles.guestGate} aria-labelledby="account-login-title">
            <span aria-hidden="true">V</span>
            <div>
              <span>Нужен вход</span>
              <h2 id="account-login-title">Открываем авторизацию</h2>
              <p>После входа вернём вас в выбранный раздел кабинета.</p>
              <Link className={styles.primaryLink} href={`/auth?returnTo=${returnTo}`}>Войти в Vault</Link>
            </div>
          </section>
        ) : (
          <>
            <details className={styles.mobileNavigation}>
              <summary>Раздел аккаунта: {accountNav.find((item) => item.href === pathname)?.label ?? "Обзор"}</summary>
              <AccountLinks pathname={pathname} />
            </details>
            <div className={styles.shellLayout}>
              <aside className={styles.sidebar} aria-label="Профиль и навигация">
                <div className={styles.profileCompact}>
                  <span className={styles.avatar} aria-hidden="true">V</span>
                  <div><strong>{displayName}</strong><span>{session?.steamAccount ? "Steam подключён" : "Email-аккаунт"}</span></div>
                </div>
                <AccountLinks pathname={pathname} />
                <div className={styles.sidebarBalance}>
                  <span>Баланс</span>
                  <strong>{balanceCoins.toLocaleString("ru-RU")} Coins</strong>
                  <Link href="/balance/top-up">Пополнить баланс</Link>
                </div>
              </aside>
              <div className={styles.accountContent}>{children}</div>
            </div>
          </>
        )}
      </Container>
    </main>
  );
}
