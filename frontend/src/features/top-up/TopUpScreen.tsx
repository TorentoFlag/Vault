"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Breadcrumbs, Button, Container, Skeleton } from "@/components/ui/UI";
import { siteConfig } from "@/config/site";
import { createTopUpAuthReturnPath, getTopUpQuote, validateTopUpAmount } from "@/lib/top-up";

import styles from "./top-up.module.css";

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function TopUpScreen({
  suggestedCoins,
  returnTo,
}: {
  suggestedCoins: number;
  returnTo: "/cart" | null;
}) {
  const {
    balanceCoins,
    cartShortfallCoins,
    isAuthenticated,
    isHydrated,
  } = useMarketplace();
  const [amount, setAmount] = useState(String(suggestedCoins));
  const [isDirty, setIsDirty] = useState(false);
  const [isTouched, setIsTouched] = useState(false);

  const authoritativeSuggestion =
    returnTo === "/cart" && cartShortfallCoins > 0 ? cartShortfallCoins : suggestedCoins;
  const authReturnPath = createTopUpAuthReturnPath(returnTo, authoritativeSuggestion);
  const displayedAmount = isDirty ? amount : String(authoritativeSuggestion);
  const amountError = validateTopUpAmount(displayedAmount);
  const showAmountError = (isTouched || isDirty) && !!amountError;
  const parsedAmount = amountError ? 0 : Number(displayedAmount);
  const quote = getTopUpQuote(parsedAmount, siteConfig.coin.rate, balanceCoins);
  const presets = [...new Set([authoritativeSuggestion, 750, 1500, 3000, 7500])].slice(0, 4);

  function chooseAmount(value: number) {
    setAmount(String(value));
    setIsDirty(true);
    setIsTouched(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);
  }

  return (
    <main id="main-content" className={styles.page}>
      <Container>
        <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Пополнение баланса" }]} />
        <div className={styles.pageHeading}>
          <span>Калькулятор Coins</span>
          <h1>Рассчитать пополнение Coins</h1>
          <p>Укажите сумму Coins и проверьте расчёт по курсу Vault. Платёжный провайдер не подключён.</p>
        </div>
        <p className={styles.demoDisclosure}>
          <strong>Расчёт по курсу Vault</strong>
          Эта страница не принимает банковские данные и не зачисляет Coins.
        </p>

        {!isHydrated ? (
          <div className={styles.layout} aria-label="Загрузка формы пополнения">
            <Skeleton className={styles.formSkeleton} />
            <Skeleton className={styles.summarySkeleton} />
          </div>
        ) : !isAuthenticated ? (
          <section className={styles.formCard} aria-labelledby="top-up-auth-title">
            <div className={styles.formHeading}>
              <span>Аккаунт Vault</span>
              <h2 id="top-up-auth-title">Войдите для работы с балансом</h2>
              <p>Баланс Coins и расчёты пополнения доступны только в конкретном аккаунте.</p>
            </div>
            <Link className={styles.primaryLink} href={`/auth?returnTo=${encodeURIComponent(authReturnPath)}`}>Войти в аккаунт</Link>
          </section>
        ) : (
          <div className={styles.layout}>
            <form className={styles.formCard} noValidate onSubmit={submit}>
                  <div className={styles.formHeading}>
                    <span>Расчёт</span>
                    <h2>Сумма Coins</h2>
                    <p>Coins используются для покупки всех товаров каталога Vault.</p>
                  </div>

                  {returnTo === "/cart" && cartShortfallCoins > 0 ? (
                    <div className={styles.cartContext}>
                      <strong>Для заказа не хватает {formatNumber(cartShortfallCoins)} Coins</strong>
                      <span>Корзина сохранена. Здесь можно проверить расчёт недостающей суммы.</span>
                    </div>
                  ) : null}

                  <fieldset className={styles.presets}>
                    <legend>Быстрый выбор</legend>
                    <div>
                      {presets.map((value) => (
                        <button
                          key={value}
                          type="button"
                          data-selected={Number(displayedAmount) === value || undefined}
                          aria-pressed={Number(displayedAmount) === value}
                          onClick={() => chooseAmount(value)}
                        >
                          {formatNumber(value)} Coins
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <div className={styles.field}>
                    <label htmlFor="top-up-amount">Сумма пополнения, Coins</label>
                    <div className={styles.amountControl}>
                      <input
                        id="top-up-amount"
                        name="amount"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={displayedAmount}
                        aria-invalid={showAmountError}
                        aria-describedby={`top-up-helper${showAmountError ? " top-up-error" : ""}`}
                        onBlur={() => setIsTouched(true)}
                        onChange={(event) => {
                          setAmount(event.target.value);
                          setIsDirty(true);
                        }}
                      />
                      <span>Coins</span>
                    </div>
                    <p id="top-up-helper">От 100 до 100 000 Coins. Только целое количество.</p>
                    {showAmountError ? <p id="top-up-error" className={styles.fieldError} role="alert">{amountError}</p> : null}
                  </div>

                  <div className={styles.mockMethod}>
                    <span className={styles.methodMark}>V</span>
                    <div>
                      <strong>Банковская карта или СБП</strong>
                      <p>Оплата станет доступна после подключения платёжного провайдера.</p>
                    </div>
                    <span>Недоступно</span>
                  </div>

                  <Button className={styles.submitButton} type="submit" disabled>
                    Платёж не подключён
                  </Button>
                  <p className={styles.formFootnote}>Можно проверить курс и итоговую сумму. Зачисление Coins отключено, пока платёжный провайдер не подключён.</p>
            </form>

            <aside className={styles.summaryCard} aria-labelledby="top-up-summary-title">
              <span>Расчёт</span>
              <h2 id="top-up-summary-title">Расчёт баланса</h2>
              <dl aria-live="polite">
                <div><dt>Текущий баланс</dt><dd>{formatNumber(balanceCoins)} Coins</dd></div>
                <div><dt>Выбранная сумма</dt><dd>+{formatNumber(quote.coins)} Coins</dd></div>
                <div className={styles.totalRow}><dt>Баланс по расчёту</dt><dd>{formatNumber(quote.balanceAfter)} Coins</dd></div>
              </dl>
              <div className={styles.rateInfo}>
                <div><span>Расчётный курс</span><strong>1 ₽ = {siteConfig.coin.rate.toLocaleString("ru-RU")} Coins</strong></div>
                <div><span>Расчётная стоимость</span><strong>{formatNumber(quote.rubles)} ₽</strong></div>
              </div>
              <p>Курс хранится централизованно. Расчёт не создаёт платёж и не изменяет баланс.</p>
            </aside>
          </div>
        )}
      </Container>
    </main>
  );
}
