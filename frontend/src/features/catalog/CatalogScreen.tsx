"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ProductCard } from "@/components/marketplace/ProductCard";
import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Icon } from "@/components/ui/Icon";
import { Breadcrumbs, Button, Checkbox, Container, EmptyState } from "@/components/ui/UI";
import { getCatalogGameLabel } from "@/lib/catalog-games";
import {
  createDefaultCatalogFilters,
  filterAndSortCatalog,
  getCatalogScrollStorageKey,
  parseCatalogScrollPosition,
  parseCatalogSearchParams,
  serializeCatalogFilters,
  type CatalogFilters,
  type CatalogSort,
} from "@/lib/catalog";
import { fetchCatalogList, type CatalogPagination } from "@/lib/catalog-api";
import {
  CATALOG_FEED_BATCH_SIZE,
  createCatalogFeedEntries,
  getNextCatalogFeedSize,
} from "@/lib/catalog-feed";
import type { ProductFilter } from "@/lib/marketplace";
import { getServiceNavigationHref, serviceNavigation } from "@/lib/service-navigation";
import type { Product } from "@/types/commerce";

import styles from "./catalog.module.css";

const categories: { value: ProductFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "steam", label: "Steam" },
  { value: "skins", label: "Игровые предметы" },
];

const sortOptions: { value: CatalogSort; label: string }[] = [
  { value: "relevance", label: "По релевантности" },
  { value: "price_asc", label: "Сначала дешевле" },
  { value: "price_desc", label: "Сначала дороже" },
  { value: "newest", label: "Сначала новые" },
];

const categoryLabels = Object.fromEntries(
  categories.map((category) => [category.value, category.label]),
) as Record<ProductFilter, string>;

const sortLabels = Object.fromEntries(
  sortOptions.map((sort) => [sort.value, sort.label]),
) as Record<CatalogSort, string>;

function mergeProducts(current: Product[], next: Product[]) {
  const seen = new Set(current.map((product) => product.id));
  const merged = [...current];
  next.forEach((product) => {
    if (seen.has(product.id)) return;
    seen.add(product.id);
    merged.push(product);
  });
  return merged;
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function numberFromInput(value: string) {
  if (value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function productCondition(product: Product) {
  return product.details.specifications.find((item) => item.label.toLocaleLowerCase("ru-RU") === "состояние")?.value;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "ru-RU"));
}

function FilterPanel({
  filters,
  onChange,
  onReset,
  onApply,
  onClose,
  open,
  hasActiveFilters,
  dialogRef,
  closeButtonRef,
  products,
}: {
  filters: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
  open: boolean;
  hasActiveFilters: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  products: Product[];
}) {
  const relevantProducts = products.filter((product) => (
    (filters.category === "all" || product.kind === filters.category)
    && (filters.game === undefined || (product.kind === "skins" && product.game?.toLocaleLowerCase("en-US") === filters.game))
  ));
  const typeOptions = uniqueSorted(
    relevantProducts
      .map((product) => product.productType),
  );
  const conditionOptions = uniqueSorted(
    relevantProducts
      .filter((product) => product.kind === "skins")
      .map((product) => productCondition(product) ?? ""),
  );
  const typeLegend = filters.category === "skins" && filters.game === "cs2"
    ? "Оружие"
    : "Тип предмета";
  const filteredTypeOptions = filters.category === "steam"
    ? typeOptions.filter((type) => typeOptions.length > 1 || type !== "Пополнение баланса")
    : typeOptions;
  const limitedTypeOptions = filteredTypeOptions.slice(0, 18);
  const limitedConditionOptions = conditionOptions.slice(0, 12);
  const hiddenTypeCount = Math.max(0, filteredTypeOptions.length - limitedTypeOptions.length);
  const hiddenConditionCount = Math.max(0, conditionOptions.length - limitedConditionOptions.length);
  const typeHint = hiddenTypeCount > 0
    ? `Ещё ${hiddenTypeCount.toLocaleString("ru-RU")} типов доступны через поиск.`
    : "";
  const conditionHint = hiddenConditionCount > 0
    ? `Ещё ${hiddenConditionCount.toLocaleString("ru-RU")} состояний доступны через поиск.`
    : "";

  return (
    <aside
      id="catalog-filters"
      ref={dialogRef}
      className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}
      aria-label="Фильтры каталога"
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
    >
      <div className={styles.sidebarHeader}>
        <div>
          <strong id="catalog-filter-title">Фильтры</strong>
          <span>Уточните параметры</span>
        </div>
        <button ref={closeButtonRef} className={styles.closeFilters} type="button" onClick={onClose}>
          <span aria-hidden="true">×</span>
          <span className={styles.srOnly}>Закрыть фильтры</span>
        </button>
      </div>

      {limitedTypeOptions.length ? (
        <fieldset className={styles.filterGroup}>
          <legend>{typeLegend}</legend>
          {limitedTypeOptions.map((type) => (
            <Checkbox
              key={type}
              label={type}
              checked={filters.types.includes(type)}
              onChange={() => onChange({
                ...filters,
                types: toggleValue(filters.types, type),
              })}
            />
          ))}
          {typeHint ? <span className={styles.filterHint}>{typeHint}</span> : null}
        </fieldset>
      ) : null}

      {limitedConditionOptions.length ? (
        <fieldset className={styles.filterGroup}>
          <legend>Состояние</legend>
          {limitedConditionOptions.map((condition) => (
            <Checkbox
              key={condition}
              label={condition}
              checked={filters.conditions.includes(condition)}
              onChange={() => onChange({
                ...filters,
                conditions: toggleValue(filters.conditions, condition),
              })}
            />
          ))}
          {conditionHint ? <span className={styles.filterHint}>{conditionHint}</span> : null}
        </fieldset>
      ) : null}

      <fieldset className={styles.filterGroup}>
        <legend>Цена, Coins</legend>
        <div className={styles.priceInputs}>
          <label>
            <span>От</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="0"
              value={filters.minPrice ?? ""}
              onChange={(event) => onChange({
                ...filters,
                minPrice: numberFromInput(event.target.value),
              })}
            />
          </label>
          <label>
            <span>До</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="∞"
              value={filters.maxPrice ?? ""}
              onChange={(event) => onChange({
                ...filters,
                maxPrice: numberFromInput(event.target.value),
              })}
            />
          </label>
        </div>
      </fieldset>

      <div className={styles.filterActions}>
        <Button type="button" onClick={onApply}>Применить фильтры</Button>
        <Button
          className={styles.resetButton}
          tone="secondary"
          type="button"
          onClick={onReset}
          disabled={!hasActiveFilters}
        >
          Сбросить фильтры
        </Button>
      </div>
    </aside>
  );
}

type ActiveChip = {
  id: string;
  label: string;
  remove: (filters: CatalogFilters) => CatalogFilters;
};

function getActiveChips(filters: CatalogFilters): ActiveChip[] {
  const chips: ActiveChip[] = [];

  if (filters.query) {
    chips.push({
      id: "query",
      label: `Поиск: ${filters.query}`,
      remove: (current) => ({ ...current, query: "" }),
    });
  }

  if (filters.category !== "all") {
    chips.push({
      id: "category",
      label: categoryLabels[filters.category],
      remove: (current) => ({ ...current, category: "all" }),
    });
  }

  if (filters.game !== undefined) {
    chips.push({
      id: "game",
      label: getCatalogGameLabel(filters.game),
      remove: (current) => ({ ...current, game: undefined }),
    });
  }

  filters.types.forEach((type) => chips.push({
    id: `type-${type}`,
    label: type,
    remove: (current) => ({
      ...current,
      types: current.types.filter((item) => item !== type),
    }),
  }));

  filters.conditions.forEach((condition) => chips.push({
    id: `condition-${condition}`,
    label: condition,
    remove: (current) => ({
      ...current,
      conditions: current.conditions.filter((item) => item !== condition),
    }),
  }));

  if (filters.minPrice !== undefined) {
    chips.push({
      id: "min-price",
      label: `От ${filters.minPrice.toLocaleString("ru-RU")} Coins`,
      remove: (current) => ({ ...current, minPrice: undefined }),
    });
  }

  if (filters.maxPrice !== undefined) {
    chips.push({
      id: "max-price",
      label: `До ${filters.maxPrice.toLocaleString("ru-RU")} Coins`,
      remove: (current) => ({ ...current, maxPrice: undefined }),
    });
  }

  if (filters.sort !== "relevance") {
    chips.push({
      id: "sort",
      label: sortLabels[filters.sort],
      remove: (current) => ({ ...current, sort: "relevance" }),
    });
  }

  return chips;
}

export function CatalogScreen({ products, pagination }: { products: Product[]; pagination: CatalogPagination }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useMarketplace();
  const filters = useMemo(() => parseCatalogSearchParams(searchParams), [searchParams]);
  const filtersKey = useMemo(() => serializeCatalogFilters(filters).toString(), [filters]);
  const [loadedProducts, setLoadedProducts] = useState(products);
  const [serverPagination, setServerPagination] = useState(pagination);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [feedState, setFeedState] = useState({ key: "", count: CATALOG_FEED_BATCH_SIZE });
  const [loadedFiltersKey, setLoadedFiltersKey] = useState(filtersKey);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterDialogRef = useRef<HTMLElement>(null);
  const closeFilterButtonRef = useRef<HTMLButtonElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [draftFilters, setDraftFilters] = useState<CatalogFilters>(() => filters);
  const visibleProducts = useMemo(
    () => filterAndSortCatalog(loadedProducts, filters),
    [filters, loadedProducts],
  );
  const visibleCount = feedState.key === filtersKey
    ? feedState.count
    : CATALOG_FEED_BATCH_SIZE;
  const feedEntries = useMemo(
    () => createCatalogFeedEntries(visibleProducts, visibleCount),
    [visibleCount, visibleProducts],
  );
  const hasMoreLocalProducts = feedEntries.length < visibleProducts.length;
  const hasMoreProducts = hasMoreLocalProducts || serverPagination.hasMore;
  const activeChips = useMemo(() => getActiveChips(filters), [filters]);
  const draftChips = useMemo(() => getActiveChips(draftFilters), [draftFilters]);
  const catalogReturnHref = filtersKey ? `${pathname}?${filtersKey}` : pathname;

  useEffect(() => {
    if (loadedFiltersKey === "" || loadedFiltersKey === filtersKey) return;
    let cancelled = false;

    async function refreshCatalogPage() {
      setLoadingMore(true);
      setLoadMoreError("");
      try {
        const nextPage = await fetchCatalogList({
          filters,
          limit: serverPagination.limit,
          offset: 0,
        });
        if (cancelled) return;
        setLoadedProducts(nextPage.items);
        setServerPagination(nextPage.pagination);
        setFeedState({ key: filtersKey, count: CATALOG_FEED_BATCH_SIZE });
        setLoadedFiltersKey(filtersKey);
      } catch {
        if (!cancelled) {
          setLoadMoreError("Не удалось обновить каталог по выбранным фильтрам. Повторите действие.");
        }
      } finally {
        if (!cancelled) setLoadingMore(false);
      }
    }

    void refreshCatalogPage();

    return () => {
      cancelled = true;
    };
  }, [filters, filtersKey, loadedFiltersKey, serverPagination.limit]);

  const loadMoreProducts = useCallback(async () => {
    if (hasMoreLocalProducts) {
      setFeedState((current) => ({
        key: filtersKey,
        count: getNextCatalogFeedSize(
          current.key === filtersKey ? current.count : CATALOG_FEED_BATCH_SIZE,
          visibleProducts.length,
        ),
      }));
      return;
    }

    if (!serverPagination.hasMore || loadingMore) return;

    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const nextPage = await fetchCatalogList({
        filters,
        limit: serverPagination.limit,
        offset: serverPagination.offset + serverPagination.limit,
      });
      setLoadedProducts((current) => mergeProducts(current, nextPage.items));
      setServerPagination(nextPage.pagination);
      setFeedState({ key: filtersKey, count: visibleProducts.length + nextPage.items.length });
      setLoadedFiltersKey(filtersKey);
    } catch {
      setLoadMoreError("Не удалось загрузить следующую страницу каталога. Повторите действие.");
    } finally {
      setLoadingMore(false);
    }
  }, [
    filters,
    filtersKey,
    hasMoreLocalProducts,
    loadingMore,
    serverPagination.hasMore,
    serverPagination.limit,
    serverPagination.offset,
    visibleProducts.length,
  ]);

  useEffect(() => {
    let savedPosition: number | null = null;
    const storageKey = getCatalogScrollStorageKey(catalogReturnHref);
    try {
      savedPosition = parseCatalogScrollPosition(window.sessionStorage.getItem(storageKey));
    } catch { /* Keep the catalog usable when session storage is blocked. */ }
    if (savedPosition === null) return;

    const restoreTask = window.setTimeout(() => {
      setFeedState({ key: filtersKey, count: visibleProducts.length });
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: savedPosition, behavior: "auto" });
        try { window.sessionStorage.removeItem(storageKey); } catch { /* Restoration already succeeded. */ }
      });
    }, 0);
    return () => window.clearTimeout(restoreTask);
  }, [catalogReturnHref, filtersKey, visibleProducts.length]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;

    if (!sentinel || !hasMoreProducts || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;

      observer.unobserve(sentinel);
      void loadMoreProducts();
    }, { rootMargin: "640px 0px" });

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMoreProducts, loadMoreProducts, visibleCount]);

  useEffect(() => {
    if (!filtersOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      closeFilterButtonRef.current?.focus({ preventScroll: true });
    }, 50);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setFiltersOpen(false);
        filterTriggerRef.current?.focus();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = filterDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );

      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [filtersOpen]);

  function updateFilters(next: CatalogFilters) {
    const serialized = serializeCatalogFilters(next);
    const normalized = parseCatalogSearchParams(serialized);
    setDraftFilters(normalized);
    const query = serialized.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function resetFilters() {
    updateFilters(createDefaultCatalogFilters());
  }

  function openFilters() {
    setDraftFilters(filters);
    setFiltersOpen(true);
  }

  function resetVisibleFilters() {
    const defaults = createDefaultCatalogFilters();
    setDraftFilters(defaults);
    if (!filtersOpen) updateFilters(defaults);
  }

  function applyFilters() {
    updateFilters(draftFilters);
    if (filtersOpen) closeFilters();
  }

  function closeFilters() {
    setFiltersOpen(false);
    requestAnimationFrame(() => filterTriggerRef.current?.focus());
  }

  function isCurrentService(href: string) {
    const target = new URL(href, "https://vault.local");
    if (target.pathname !== pathname) return false;
    if (target.searchParams.size === 0) {
      return pathname === "/catalog"
        && !searchParams.has("category")
        && !searchParams.has("game")
        && !searchParams.has("q");
    }
    return [...target.searchParams].every(([key, value]) => searchParams.get(key) === value);
  }

  return (
    <main id="main-content" className={styles.catalogPage}>
      <Container>
        <div className={styles.intro}>
          <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Каталог" }]} />
          <h1>Каталог цифровых товаров</h1>
          <p>Пополнение Steam и игровые предметы с ценами в Coins.</p>
        </div>

        <nav className={styles.catalogServiceNav} aria-label="Разделы каталога">
          {serviceNavigation.map((item) => (
            <Link
              key={item.label}
              href={getServiceNavigationHref(item, Boolean(session))}
              aria-current={isCurrentService(item.href) ? "page" : undefined}
            >
              <Icon name={item.icon} width="17" height="17" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.toolbar}>
          <div className={styles.resultSummary}>
            <strong>{filters.query ? `Результаты по запросу «${filters.query}»` : "Все товары"}</strong>
            <span className={styles.demoNote}>Тип оформления указан в каждой карточке</span>
            <span className={styles.srOnly} aria-live="polite">
              Показано товаров: {feedEntries.length} из {serverPagination.total}
            </span>
          </div>
          <div className={styles.toolbarActions}>
            <button
              ref={filterTriggerRef}
              className={styles.filterToggle}
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="catalog-filters"
              onClick={openFilters}
            >
              Фильтры
              {activeChips.length ? <span>{activeChips.length}</span> : null}
            </button>
            <label className={styles.sortControl}>
              <span>Сортировка</span>
              <select
                value={filters.sort}
                onChange={(event) => updateFilters({
                  ...filters,
                  sort: event.target.value as CatalogSort,
                })}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {activeChips.length ? (
          <div className={styles.activeFilters} aria-label="Активные фильтры">
            {activeChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => updateFilters(chip.remove(filters))}
                aria-label={`Убрать фильтр: ${chip.label}`}
              >
                {chip.label}
                <span aria-hidden="true">×</span>
              </button>
            ))}
            <button className={styles.clearAll} type="button" onClick={resetFilters}>
              Сбросить всё
            </button>
          </div>
        ) : null}

        <div className={styles.catalogLayout}>
          <button
            className={`${styles.overlay} ${filtersOpen ? styles.overlayVisible : ""}`}
            type="button"
            aria-label="Закрыть фильтры"
            onClick={closeFilters}
          />
          <FilterPanel
            filters={draftFilters}
            onChange={setDraftFilters}
            onReset={resetVisibleFilters}
            onApply={applyFilters}
            onClose={closeFilters}
            open={filtersOpen}
            hasActiveFilters={draftChips.length > 0}
            dialogRef={filterDialogRef}
            closeButtonRef={closeFilterButtonRef}
            products={loadedProducts}
          />

          <div className={styles.results}>
            {visibleProducts.length ? (
              <>
                <div className={styles.productGrid} data-catalog-count={feedEntries.length}>
                  {feedEntries.map(({ key, item: product }, index) => (
                    <ProductCard
                      key={key}
                      product={product}
                      priority={index < 4}
                      headingLevel={2}
                      returnHref={catalogReturnHref}
                    />
                  ))}
                </div>
                <div ref={loadMoreRef} className={`${styles.loadMore} ${hasMoreProducts ? "" : styles.loadMoreEnd}`} aria-live="polite">
                  <span>Показано карточек: {feedEntries.length} из {serverPagination.total.toLocaleString("ru-RU")}</span>
                  {loadMoreError ? <span>{loadMoreError}</span> : null}
                  {hasMoreProducts ? <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadMoreProducts()}
                  >{loadingMore ? "Загружаем..." : "Показать ещё"}</button> : <strong>Вы посмотрели все товары в этой подборке</strong>}
                </div>
              </>
            ) : (
              <EmptyState>
                <div className={styles.emptyContent}>
                  <strong>Товары не найдены</strong>
                  <p>Измените параметры или сбросьте фильтры, чтобы увидеть весь каталог.</p>
                  <Button type="button" onClick={resetFilters}>Сбросить фильтры</Button>
                </div>
              </EmptyState>
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}
