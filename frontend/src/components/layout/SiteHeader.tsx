"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { siteConfig } from "@/config/site";
import { Icon } from "@/components/ui/Icon";
import { MarketplaceSearch } from "@/components/marketplace/MarketplaceSearch";
import { CartButton } from "@/components/marketplace/CartButton";
import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { formatCoinRate } from "@/lib/marketplace";

import styles from "./layout.module.css";

function SyncedHeaderSearch() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const currentSearch = searchParams.toString();
  return <MarketplaceSearch key={`${query}:${currentSearch}`} products={[]} initialQuery={query} currentSearch={currentSearch} />;
}

function HeaderSearch() {
  return (
    <Suspense fallback={<MarketplaceSearch products={[]} />}>
      <SyncedHeaderSearch />
    </Suspense>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { balanceCoins, session, isHydrated } = useMarketplace();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const desktopMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const accountLabel = session?.steamAccount?.displayName ?? session?.emailAccount?.displayName ?? "Войти";
  const accountHref = session ? "/account" : "/auth?returnTo=%2Faccount";

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !desktopMenuButtonRef.current?.contains(target) && !mobileMenuButtonRef.current?.contains(target)) setMenuOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      (mobileMenuButtonRef.current?.offsetParent ? mobileMenuButtonRef : desktopMenuButtonRef).current?.focus();
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus());
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.utilityBar}>
        <div className={styles.headerContainer}>
          <span>Цифровые товары для игр и сервисов</span>
          <nav aria-label="Быстрые разделы">
            <Link href="/#how-to-order">Как оформить заказ</Link>
            <Link href="/#faq">FAQ</Link>
            <span className={styles.serviceState}>Сервис 18+</span>
          </nav>
        </div>
      </div>
      <div className={styles.mainBar}>
        <div className={styles.mainGrid}>
          <Link className={styles.logo} href="/" aria-label="Vault, на главную">
            <span className={styles.logoMark}>V</span>
            <span>VAULT</span>
          </Link>
          <button
            ref={desktopMenuButtonRef}
            className={`${styles.catalogButton} ${pathname.startsWith("/catalog") ? styles.catalogButtonActive : ""}`}
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-controls="catalog-menu"
            aria-label={menuOpen ? "Закрыть меню каталога" : "Открыть меню каталога"}
            aria-current={pathname.startsWith("/catalog") ? "page" : undefined}
          >
            <Icon name="grid" width="19" height="19" />
            Каталог
          </button>
          <div className={styles.desktopSearch}>
            <HeaderSearch />
          </div>
          {isHydrated && session ? (
            <Link className={styles.balance} href="/balance/top-up" aria-label={`Баланс: ${balanceCoins.toLocaleString("ru-RU")} Coins. Пополнить`}>
              <Icon name="coin" width="20" height="20" />
              <span>Баланс</span>
              <strong>{balanceCoins.toLocaleString("ru-RU")} Coins</strong>
            </Link>
          ) : (
            <Link className={`${styles.balance} ${styles.balanceGuest}`} href="/auth?returnTo=%2Fbalance%2Ftop-up" aria-label={`Курс Coins: ${formatCoinRate(siteConfig.coin.rate)}`}>
              <Icon name="coin" width="20" height="20" />
              <span>Курс Coins</span>
              <strong>1 ₽ = {siteConfig.coin.rate.toLocaleString("ru-RU")}</strong>
            </Link>
          )}
          <CartButton />
          <Link
            className={styles.accountButton}
            href={accountHref}
            aria-current={pathname.startsWith("/account") || pathname === "/auth" ? "page" : undefined}
          >
            <Icon name="user" width="20" height="20" />
            <span className={styles.accountLabel}>{isHydrated ? accountLabel : "Аккаунт"}</span>
          </Link>
          <button
            ref={mobileMenuButtonRef}
            type="button"
            className={styles.mobileMenuButton}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={menuOpen}
            aria-controls="catalog-menu"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Icon name="menu" width="23" height="23" />
          </button>
        </div>
        <div className={styles.mobileSearch}>
          <HeaderSearch />
        </div>
      </div>
      {menuOpen ? (
        <nav ref={menuRef} id="catalog-menu" className={styles.catalogMenu} aria-label="Каталог">
          <div className={styles.headerContainer}>
            <Link href="/catalog" onClick={() => setMenuOpen(false)}>Все товары</Link>
            <Link href="/catalog?category=steam" onClick={() => setMenuOpen(false)}>Пополнение Steam</Link>
            <Link href="/catalog?category=skins&game=cs2" onClick={() => setMenuOpen(false)}>CS2</Link>
            <Link href="/catalog?category=skins&game=rust" onClick={() => setMenuOpen(false)}>Rust</Link>
            <Link href="/catalog?category=skins&game=tf2" onClick={() => setMenuOpen(false)}>Team Fortress 2</Link>
            {isHydrated && session ? (
              <Link className={styles.mobileAccountLink} href="/balance/top-up" onClick={() => setMenuOpen(false)}>
                Баланс: {balanceCoins.toLocaleString("ru-RU")} Coins
              </Link>
            ) : (
              <Link className={styles.mobileAccountLink} href="/auth?returnTo=%2Fbalance%2Ftop-up" onClick={() => setMenuOpen(false)}>
                Курс Coins: 1 ₽ = {siteConfig.coin.rate.toLocaleString("ru-RU")}
              </Link>
            )}
            <Link className={styles.mobileAccountLink} href={accountHref} onClick={() => setMenuOpen(false)}>
              {isHydrated ? accountLabel : "Аккаунт"}
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
