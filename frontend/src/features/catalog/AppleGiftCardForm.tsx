"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Button } from "@/components/ui/UI";
import type { Product } from "@/types/commerce";

import styles from "./catalog.module.css";

function formatMinor(value: number, currency: string) {
  const major = value / 100;
  return `${major.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${currency}`;
}

function productRegion(product: Product) {
  return product.details.appleGiftCard?.regionCode ?? "";
}

function productRegionLabel(product: Product) {
  return product.details.appleGiftCard?.regionLabel ?? product.meta[0] ?? "Регион";
}

function productNominalMinor(product: Product) {
  return product.details.appleGiftCard?.nominalMinor ?? 0;
}

function productCurrency(product: Product) {
  return product.details.appleGiftCard?.currency ?? "";
}

export function AppleGiftCardForm({ products }: { products: Product[] }) {
  const {
    addToCart,
    balanceCoins,
    isAuthenticated,
    isHydrated,
  } = useMarketplace();
  const appleProducts = useMemo(() => products
    .filter((product) => product.kind === "apple_gift_card" && product.details.appleGiftCard)
    .sort((left, right) => {
      const regionCompare = productRegionLabel(left).localeCompare(productRegionLabel(right), "ru-RU");
      return regionCompare || productNominalMinor(left) - productNominalMinor(right);
    }), [products]);
  const regions = useMemo(() => {
    const byCode = new Map<string, string>();
    appleProducts.forEach((product) => {
      const code = productRegion(product);
      if (code) byCode.set(code, productRegionLabel(product));
    });
    return [...byCode].map(([code, label]) => ({ code, label }));
  }, [appleProducts]);
  const [regionCode, setRegionCode] = useState(() => regions[0]?.code ?? "");
  const availableNominals = appleProducts.filter((product) => productRegion(product) === regionCode);
  const [productId, setProductId] = useState(() => availableNominals[0]?.id ?? appleProducts[0]?.id ?? "");
  const selectedProduct = appleProducts.find((product) => product.id === productId)
    ?? availableNominals[0]
    ?? appleProducts[0];
  const balanceAfter = selectedProduct ? balanceCoins - selectedProduct.priceCoins : balanceCoins;
  const authHref = `/auth?returnTo=${encodeURIComponent("/catalog?category=apple_gift_card")}`;
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "added">("idle");
  const [submitError, setSubmitError] = useState("");

  function chooseRegion(nextRegionCode: string) {
    const nextProduct = appleProducts.find((product) => productRegion(product) === nextRegionCode);
    setRegionCode(nextRegionCode);
    setProductId(nextProduct?.id ?? "");
    setSubmitStatus("idle");
    setSubmitError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitStatus("idle");
    setSubmitError("");
    if (!selectedProduct || !isAuthenticated || submitStatus === "submitting") return;
    setSubmitStatus("submitting");
    const added = await addToCart({ id: selectedProduct.id, slug: selectedProduct.slug, title: selectedProduct.title });
    if (!added) {
      setSubmitStatus("idle");
      setSubmitError("Не удалось добавить подарочную карту в корзину. Проверьте сессию и повторите действие.");
      return;
    }
    setSubmitStatus("added");
  }

  if (!selectedProduct) {
    return (
      <section className={styles.steamRefill} aria-labelledby="apple-gift-card-title">
        <div className={styles.steamRefillCard}>
          <div className={styles.steamRefillHeading}>
            <span>App Store & iTunes</span>
            <h2 id="apple-gift-card-title">Подарочные карты Apple</h2>
            <p>Сейчас нет доступных номиналов. Попробуйте позже или обратитесь в поддержку Vault.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.steamRefill} aria-labelledby="apple-gift-card-title">
      <form className={styles.steamRefillCard} noValidate onSubmit={submit}>
        <div className={styles.steamRefillHeading}>
          <span>App Store & iTunes</span>
          <h2 id="apple-gift-card-title">Подарочная карта Apple</h2>
        </div>

        <div className={styles.steamRefillField}>
          <label htmlFor="apple-gift-card-region">Регион</label>
          <select
            id="apple-gift-card-region"
            className={styles.appleGiftCardSelect}
            value={regionCode}
            onChange={(event) => chooseRegion(event.target.value)}
          >
            {regions.map((region) => (
              <option key={region.code} value={region.code}>{region.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.steamRefillField}>
          <label htmlFor="apple-gift-card-nominal">Номинал</label>
          <select
            id="apple-gift-card-nominal"
            className={styles.appleGiftCardSelect}
            value={selectedProduct.id}
            onChange={(event) => {
              setProductId(event.target.value);
              setSubmitStatus("idle");
              setSubmitError("");
            }}
          >
            {availableNominals.map((product) => (
              <option key={product.id} value={product.id}>
                {formatMinor(productNominalMinor(product), productCurrency(product))}
              </option>
            ))}
          </select>
          <p>Регион Apple ID должен точно соответствовать выбранной карте.</p>
        </div>

        {submitError ? <p className={styles.steamRefillError} role="alert">{submitError}</p> : null}
        {submitStatus === "added" ? <p className={styles.steamRefillSuccess} role="status">Подарочная карта добавлена в корзину.</p> : null}

        {isAuthenticated ? (
          <Button className={styles.steamRefillSubmit} type="submit" disabled={!isHydrated || submitStatus === "submitting"}>
            {submitStatus === "submitting" ? "Добавляем" : "Добавить в корзину"}
          </Button>
        ) : (
          <Link className={styles.steamRefillAuthLink} href={authHref}>Войти, чтобы добавить в корзину</Link>
        )}
      </form>

      <aside className={styles.steamRefillSummary} aria-labelledby="apple-gift-card-summary-title">
        <span>Сводка</span>
        <h2 id="apple-gift-card-summary-title">Стоимость в Coins</h2>
        <dl aria-live="polite">
          <div><dt>Регион</dt><dd>{productRegionLabel(selectedProduct)}</dd></div>
          <div><dt>Номинал</dt><dd>{formatMinor(productNominalMinor(selectedProduct), productCurrency(selectedProduct))}</dd></div>
          <div><dt>Стоимость заказа</dt><dd>{selectedProduct.priceCoins.toLocaleString("ru-RU")} Coins</dd></div>
          <div className={styles.steamRefillTotal}><dt>Баланс после покупки</dt><dd>{isAuthenticated ? `${balanceAfter.toLocaleString("ru-RU")} Coins` : "После входа"}</dd></div>
        </dl>
        <div className={styles.steamRefillRate}>
          <div><span>Доставка</span><strong>На подтверждённый email</strong></div>
        </div>
      </aside>
    </section>
  );
}
