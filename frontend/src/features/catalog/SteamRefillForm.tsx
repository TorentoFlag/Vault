"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Button } from "@/components/ui/UI";
import { siteConfig } from "@/config/site";
import {
  STEAM_REFILL_MAX_RUB,
  STEAM_REFILL_MIN_RUB,
  STEAM_REFILL_PRESET_RUB,
  createSteamRefillCartItem,
  getSteamRefillQuote,
  validateSteamRefillRubAmount,
} from "@/lib/steam-refill";

import styles from "./catalog.module.css";

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function SteamRefillForm() {
  const {
    addToCart,
    balanceCoins,
    isAuthenticated,
    isHydrated,
  } = useMarketplace();
  const [amount, setAmount] = useState("1000");
  const [isTouched, setIsTouched] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "added">("idle");
  const [submitError, setSubmitError] = useState("");

  const amountError = validateSteamRefillRubAmount(amount);
  const showAmountError = isTouched && !!amountError;
  const parsedAmount = amountError ? 0 : Number(amount);
  const quote = getSteamRefillQuote(parsedAmount, siteConfig.coin.rate);
  const balanceAfter = balanceCoins - quote.coins;
  const authHref = `/auth?returnTo=${encodeURIComponent("/catalog?category=steam")}`;

  function chooseAmount(value: number) {
    setAmount(String(value));
    setIsTouched(true);
    setSubmitStatus("idle");
    setSubmitError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);
    setSubmitError("");
    setSubmitStatus("idle");
    if (amountError || !isAuthenticated || submitStatus === "submitting") return;
    setSubmitStatus("submitting");
    const added = await addToCart(createSteamRefillCartItem(parsedAmount));
    if (!added) {
      setSubmitStatus("idle");
      setSubmitError("Не удалось добавить пополнение в корзину. Проверьте сессию и повторите действие.");
      return;
    }
    setSubmitStatus("added");
  }

  return (
    <section className={styles.steamRefill} aria-labelledby="steam-refill-title">
      <form className={styles.steamRefillCard} noValidate onSubmit={submit}>
        <div className={styles.steamRefillHeading}>
          <span>Steam Wallet</span>
          <h2 id="steam-refill-title">Пополнение аккаунта Steam</h2>
          <p>Введите сумму в RUB, а Vault рассчитает стоимость заказа в Coins.</p>
        </div>

        <fieldset className={styles.steamRefillPresets}>
          <legend>Быстрый выбор</legend>
          <div>
            {STEAM_REFILL_PRESET_RUB.map((value) => (
              <button
                key={value}
                type="button"
                data-selected={Number(amount) === value || undefined}
                aria-pressed={Number(amount) === value}
                onClick={() => chooseAmount(value)}
              >
                {formatNumber(value)} RUB
              </button>
            ))}
          </div>
        </fieldset>

        <div className={styles.steamRefillField}>
          <label htmlFor="steam-refill-amount">Сумма пополнения, RUB</label>
          <div className={styles.steamRefillAmount}>
            <input
              id="steam-refill-amount"
              name="steam-refill-amount"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              aria-invalid={showAmountError}
              aria-describedby={`steam-refill-helper${showAmountError ? " steam-refill-error" : ""}`}
              onBlur={() => setIsTouched(true)}
              onChange={(event) => {
                setAmount(event.target.value);
                setSubmitStatus("idle");
                setSubmitError("");
              }}
            />
            <span>RUB</span>
          </div>
          <p id="steam-refill-helper">
            От {STEAM_REFILL_MIN_RUB} до {STEAM_REFILL_MAX_RUB.toLocaleString("ru-RU")} RUB. Только целая сумма.
          </p>
          {showAmountError ? <p id="steam-refill-error" className={styles.steamRefillError} role="alert">{amountError}</p> : null}
        </div>

        <div className={styles.steamRefillMethod}>
          <span className={styles.steamRefillMethodMark}>S</span>
          <div>
            <strong>Оформление через корзину Vault</strong>
            <p>Логин Steam будет указан на шаге оформления заказа.</p>
          </div>
          <span>SIH</span>
        </div>

        {submitError ? <p className={styles.steamRefillError} role="alert">{submitError}</p> : null}
        {submitStatus === "added" ? <p className={styles.steamRefillSuccess} role="status">Пополнение добавлено в корзину.</p> : null}

        {isAuthenticated ? (
          <Button className={styles.steamRefillSubmit} type="submit" disabled={!isHydrated || !!amountError || submitStatus === "submitting"}>
            {submitStatus === "submitting" ? "Добавляем" : "Добавить в корзину"}
          </Button>
        ) : (
          <Link className={styles.steamRefillAuthLink} href={authHref}>Войти, чтобы добавить в корзину</Link>
        )}
      </form>

      <aside className={styles.steamRefillSummary} aria-labelledby="steam-refill-summary-title">
        <span>Расчёт</span>
        <h2 id="steam-refill-summary-title">Стоимость в Coins</h2>
        <dl aria-live="polite">
          <div><dt>Сумма Steam</dt><dd>{formatNumber(quote.rubles)} RUB</dd></div>
          <div><dt>Стоимость заказа</dt><dd>{formatNumber(quote.coins)} Coins</dd></div>
          <div className={styles.steamRefillTotal}><dt>Баланс после покупки</dt><dd>{isAuthenticated ? `${formatNumber(balanceAfter)} Coins` : "После входа"}</dd></div>
        </dl>
        <div className={styles.steamRefillRate}>
          <div><span>Расчётный курс</span><strong>1 RUB = {siteConfig.coin.rate.toLocaleString("ru-RU")} Coins</strong></div>
          <div><span>Лимит SIH</span><strong>{STEAM_REFILL_MIN_RUB}-{STEAM_REFILL_MAX_RUB.toLocaleString("ru-RU")} RUB</strong></div>
        </div>
      </aside>
    </section>
  );
}
