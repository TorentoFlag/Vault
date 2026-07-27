"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ProductCard } from "@/components/marketplace/ProductCard";
import { Breadcrumbs, Button, Checkbox, Container, EmptyState } from "@/components/ui/UI";
import { catalogProducts } from "@/data/products";
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
import {
  CATALOG_FEED_BATCH_SIZE,
  createCatalogFeedEntries,
  getNextCatalogFeedSize,
} from "@/lib/catalog-feed";
import type { ProductFilter } from "@/lib/marketplace";
import type { ProductAvailability, ProductFulfillmentMode } from "@/types/commerce";

import styles from "./catalog.module.css";

const categories: { value: ProductFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "steam", label: "Steam" },
  { value: "gpt", label: "GPT" },
  { value: "skins", label: "Игровые предметы" },
];

const statuses: { value: ProductAvailability; label: string }[] = [
  { value: "available", label: "В наличии" },
  { value: "on-request", label: "Под заказ" },
];

const typeOptions = [...new Set(
  catalogProducts
    .filter((product) => product.kind !== "skins")
    .map((product) => product.productType),
)];

const weaponOptions = [...new Set(
  catalogProducts
    .filter((product) => product.kind === "skins")
    .map((product) => product.productType),
)];

const fulfillmentOptions: { value: ProductFulfillmentMode; label: string }[] = [
  { value: "automatic", label: "Цифровой заказ" },
  { value: "steam-trade", label: "Данные Steam Trade" },
  { value: "manual", label: "Заказ с проверкой" },
];

const sortOptions: { value: CatalogSort; label: string }[] = [
  { value: "relevance", label: "По релевантности" },
  { value: "price-asc", label: "Сначала дешевле" },
  { value: "price-desc", label: "Сначала дороже" },
  { value: "newest", label: "Сначала новые" },
];

const categoryLabels = Object.fromEntries(
  categories.map((category) => [category.value, category.label]),
) as Record<ProductFilter, string>;

const statusLabels = Object.fromEntries(
  statuses.map((status) => [status.value, status.label]),
) as Record<ProductAvailability, string>;

const fulfillmentLabels = Object.fromEntries(
  fulfillmentOptions.map((mode) => [mode.value, mode.label]),
) as Record<ProductFulfillmentMode, string>;

const sortLabels = Object.fromEntries(
  sortOptions.map((sort) => [sort.value, sort.label]),
) as Record<CatalogSort, string>;

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
}) {
  const relevantStatuses = statuses.filter((status) => catalogProducts.some((product) => (
    (filters.category === "all" || product.kind === filters.category)
    && product.availability === status.value
  )));
  const relevantFulfillmentOptions = fulfillmentOptions.filter((mode) => catalogProducts.some((product) => (
    (filters.category === "all" || product.kind === filters.category)
    && product.fulfillmentMode === mode.value
  )));
  const relevantTypeOptions = typeOptions.filter((type) => catalogProducts.some((product) => (
    product.kind !== "skins"
    && (filters.category === "all" || product.kind === filters.category)
    && product.productType === type
  )));

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

      <fieldset className={styles.filterGroup}>
        <legend>Наличие</legend>
        {relevantStatuses.map((status) => (
          <Checkbox
            key={status.value}
            label={status.label}
            checked={filters.statuses.includes(status.value)}
            onChange={() => onChange({
              ...filters,
              statuses: toggleValue(filters.statuses, status.value),
            })}
          />
        ))}
      </fieldset>

      <fieldset className={styles.filterGroup}>
        <legend>Получение</legend>
        {relevantFulfillmentOptions.map((mode) => (
          <Checkbox
            key={mode.value}
            label={mode.label}
            checked={filters.fulfillmentModes.includes(mode.value)}
            onChange={() => onChange({
              ...filters,
              fulfillmentModes: toggleValue(filters.fulfillmentModes, mode.value),
            })}
          />
        ))}
      </fieldset>

      {filters.category !== "skins" ? (
        <fieldset className={styles.filterGroup}>
          <legend>Тип товара</legend>
          {relevantTypeOptions.map((type) => (
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
        </fieldset>
      ) : null}

      {filters.category === "all" || filters.category === "skins" ? (
        <fieldset className={styles.filterGroup}>
          <legend>Оружие</legend>
          {weaponOptions.map((weapon) => (
            <Checkbox
              key={weapon}
              label={weapon}
              checked={filters.weaponTerms.includes(weapon)}
              onChange={() => onChange({
                ...filters,
                weaponTerms: toggleValue(filters.weaponTerms, weapon),
              })}
            />
          ))}
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
        {open ? <Button type="button" onClick={onApply}>Применить фильтры</Button> : null}
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

  filters.statuses.forEach((status) => chips.push({
    id: `status-${status}`,
    label: statusLabels[status],
    remove: (current) => ({
      ...current,
      statuses: current.statuses.filter((item) => item !== status),
    }),
  }));

  filters.types.forEach((type) => chips.push({
    id: `type-${type}`,
    label: type,
    remove: (current) => ({
      ...current,
      types: current.types.filter((item) => item !== type),
    }),
  }));

  filters.fulfillmentModes.forEach((mode) => chips.push({
    id: `fulfillment-${mode}`,
    label: fulfillmentLabels[mode],
    remove: (current) => ({
      ...current,
      fulfillmentModes: current.fulfillmentModes.filter((item) => item !== mode),
    }),
  }));

  filters.weaponTerms.forEach((weapon) => chips.push({
    id: `weapon-${weapon}`,
    label: weapon,
    remove: (current) => ({
      ...current,
      weaponTerms: current.weaponTerms.filter((item) => item !== weapon),
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

export function CatalogScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [feedState, setFeedState] = useState({ key: "", count: CATALOG_FEED_BATCH_SIZE });
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterDialogRef = useRef<HTMLElement>(null);
  const closeFilterButtonRef = useRef<HTMLButtonElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const filters = useMemo(() => parseCatalogSearchParams(searchParams), [searchParams]);
  const [draftFilters, setDraftFilters] = useState<CatalogFilters>(() => createDefaultCatalogFilters());
  const visibleProducts = useMemo(
    () => filterAndSortCatalog(catalogProducts, filters),
    [filters],
  );
  const filtersKey = useMemo(() => serializeCatalogFilters(filters).toString(), [filters]);
  const visibleCount = feedState.key === filtersKey
    ? feedState.count
    : CATALOG_FEED_BATCH_SIZE;
  const feedEntries = useMemo(
    () => createCatalogFeedEntries(visibleProducts, visibleCount),
    [visibleCount, visibleProducts],
  );
  const hasMoreProducts = feedEntries.length < visibleProducts.length;
  const activeChips = useMemo(() => getActiveChips(filters), [filters]);
  const draftChips = useMemo(() => getActiveChips(draftFilters), [draftFilters]);
  const catalogReturnHref = filtersKey ? `${pathname}?${filtersKey}` : pathname;

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
      setFeedState((current) => ({
        key: filtersKey,
        count: getNextCatalogFeedSize(
          current.key === filtersKey ? current.count : CATALOG_FEED_BATCH_SIZE,
          visibleProducts.length,
        ),
      }));
    }, { rootMargin: "640px 0px" });

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [filtersKey, hasMoreProducts, visibleCount, visibleProducts.length]);

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
    const query = serializeCatalogFilters(next).toString();
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
    if (filtersOpen) {
      setDraftFilters(createDefaultCatalogFilters());
      return;
    }
    resetFilters();
  }

  function applyFilters() {
    updateFilters(draftFilters);
    closeFilters();
  }

  function closeFilters() {
    setFiltersOpen(false);
    requestAnimationFrame(() => filterTriggerRef.current?.focus());
  }

  return (
    <main id="main-content" className={styles.catalogPage}>
      <Container>
        <div className={styles.intro}>
          <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Каталог" }]} />
          <h1>Каталог цифровых товаров</h1>
          <p>Пополнение Steam, GPT и игровые предметы.</p>
        </div>

        <div className={styles.categoryTabs} role="group" aria-label="Категории каталога">
          {categories.map((category) => (
            <button
              key={category.value}
              type="button"
              className={filters.category === category.value ? styles.activeTab : ""}
              aria-pressed={filters.category === category.value}
              onClick={() => updateFilters({
                ...filters,
                category: category.value,
                statuses: [],
                fulfillmentModes: [],
                types: [],
                ...(category.value !== "all" && category.value !== "skins" ? { weaponTerms: [] } : {}),
              })}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className={styles.toolbar}>
          <div className={styles.resultSummary}>
            <strong>{filters.query ? `Результаты по запросу «${filters.query}»` : "Все товары"}</strong>
            <span className={styles.demoNote}>Тип оформления указан в каждой карточке</span>
            <span className={styles.srOnly} aria-live="polite">
              Найдено товаров: {visibleProducts.length}
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
            filters={filtersOpen ? draftFilters : filters}
            onChange={filtersOpen ? setDraftFilters : updateFilters}
            onReset={resetVisibleFilters}
            onApply={applyFilters}
            onClose={closeFilters}
            open={filtersOpen}
            hasActiveFilters={(filtersOpen ? draftChips : activeChips).length > 0}
            dialogRef={filterDialogRef}
            closeButtonRef={closeFilterButtonRef}
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
                  <span>Показано карточек: {feedEntries.length}</span>
                  {hasMoreProducts ? <button
                    type="button"
                    onClick={() => setFeedState((current) => ({
                      key: filtersKey,
                      count: getNextCatalogFeedSize(
                        current.key === filtersKey ? current.count : CATALOG_FEED_BATCH_SIZE,
                        visibleProducts.length,
                      ),
                    }))}
                  >Показать ещё</button> : <strong>Вы посмотрели все товары в этой подборке</strong>}
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
