"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createCanonicalCatalogReturnPath, getCatalogScrollStorageKey, searchCatalogProducts } from "@/lib/catalog";
import type { Product } from "@/types/commerce";
import { Icon } from "@/components/ui/Icon";

import styles from "./marketplace.module.css";

export function MarketplaceSearch({
  products,
  variant = "header",
  initialQuery = "",
  currentSearch = "",
}: {
  products: Product[];
  variant?: "header" | "hero";
  initialQuery?: string;
  currentSearch?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const results = useMemo(() => searchCatalogProducts(products, query, 5), [products, query]);

  function getDetailHref(product: Product) {
    if (pathname !== "/catalog") return `/catalog/${product.slug}`;
    const returnTo = createCanonicalCatalogReturnPath(pathname, currentSearch, query);
    return `/catalog/${product.slug}?returnTo=${encodeURIComponent(returnTo)}`;
  }

  function rememberCatalogContext() {
    if (pathname !== "/catalog") return;
    const returnTo = createCanonicalCatalogReturnPath(pathname, currentSearch, query);
    try {
      window.sessionStorage.setItem(getCatalogScrollStorageKey(returnTo), String(window.scrollY));
    } catch { /* Navigation still works when session storage is unavailable. */ }
  }

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    setOpen(false);
    setActiveIndex(-1);
    router.push(normalizedQuery ? `/catalog?q=${encodeURIComponent(normalizedQuery)}` : "/catalog");
  }

  return (
    <div ref={wrapRef} className={`${styles.searchWrap} ${styles[variant]}`}>
      <form className={styles.searchForm} role="search" onSubmit={submit}>
        <Icon name="search" width="20" height="20" />
        <label className={styles.srOnly} htmlFor={`${listId}-input`}>
          Поиск по каталогу
        </label>
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          value={query}
          placeholder="Найти товар, категорию или описание"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open && Boolean(query.trim())}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!results.length) return;
              setOpen(true);
              setActiveIndex((current) => event.key === "ArrowDown"
                ? (current + 1) % results.length
                : current <= 0 ? results.length - 1 : current - 1);
              return;
            }
            if (event.key === "Enter" && open && activeIndex >= 0 && results[activeIndex]) {
              event.preventDefault();
              setOpen(false);
              rememberCatalogContext();
              router.push(getDetailHref(results[activeIndex]));
            }
          }}
        />
        <button type="submit">Найти</button>
      </form>
      {open && query.trim() ? (
        <div id={listId} className={styles.searchResults} role="listbox">
          {results.length ? (
            results.map((product, index) => (
              <Link
                key={product.id}
                id={`${listId}-option-${index}`}
                href={getDetailHref(product)}
                role="option"
                aria-selected={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  rememberCatalogContext();
                  setOpen(false);
                }}
              >
                <span className={styles.resultType}>{product.category}</span>
                <strong>{product.title}</strong>
                <span className={styles.resultPrice}>{product.priceCoins.toLocaleString("ru-RU")} Coins</span>
              </Link>
            ))
          ) : (
            <div className={styles.emptySearch}>Ничего не найдено. Измените запрос.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
