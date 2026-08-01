"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Breadcrumbs, Button, Checkbox, Container, Skeleton } from "@/components/ui/UI";
import { siteConfig } from "@/config/site";
import { createApiClient } from "@/lib/api";
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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting">("idle");
  const [submitError, setSubmitError] = useState("");

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);
    if (amountError || !acceptedTerms || submitStatus === "submitting") return;
    setSubmitStatus("submitting");
    setSubmitError("");
    try {
      const csrfClient = createApiClient();
      const csrfToken = await csrfClient.getCsrfToken();
      const session = await createApiClient({ csrfToken: () => csrfToken }).createTopUpSession({
        coinAmountMinor: quote.coins * 100,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `topup-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });
      if (session.checkoutUrl) {
        window.location.assign(session.checkoutUrl);
        return;
      }
      if (session.status === "provider_configuration_required") {
        setSubmitError("Платёжная страница ещё не настроена. Расчёт сохранён на сервере, Coins не зачислены.");
        return;
      }
      if (session.status === "manual_review") {
        setSubmitError("Платёж требует проверки поддержки. Coins не меняются автоматически до завершения разбора.");
        return;
      }
      setSubmitError("Платёжная страница недоступна. Coins не зачислены.");
    } catch {
      setSubmitError("Не удалось создать платёжную сессию. Проверьте вход в аккаунт и повторите действие.");
    } finally {
      setSubmitStatus("idle");
    }
  }

  return (
    <main id="main-content" className={styles.page}>
      <Container>
        <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Пополнение баланса" }]} />
        <div className={styles.pageHeading}>
          <span>Пополнение Coins</span>
          <h1>Пополнить баланс Coins</h1>
          <p>Укажите сумму Coins и проверьте финальный расчёт по курсу Vault перед переходом к оплате.</p>
        </div>
        <p className={styles.demoDisclosure}>
          <strong>Платёжная сессия</strong>
          Зачисление Coins выполняется только после подтверждения платежа провайдером.
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
                      <strong>СБП</strong>
                      <p>Vault создаёт платёжную сессию и ждёт подтверждение провайдера.</p>
                    </div>
                    <span>Только СБП</span>
                  </div>

                  <div className={styles.consentBox}>
                    <Checkbox
                      checked={acceptedTerms}
                      onChange={(event) => setAcceptedTerms(event.target.checked)}
                      label={(
                        <>
                          Я принимаю условия <Link href="/legal/terms">Пользовательского соглашения</Link> и даю согласие на обработку персональных данных в соответствии с <Link href="/legal/privacy">Политикой конфиденциальности</Link>.
                        </>
                      )}
                    />
                  </div>

                  {submitError ? <p className={styles.submitError} role="alert">{submitError}</p> : null}

                  <Button className={styles.submitButton} type="submit" disabled={!!amountError || !acceptedTerms || submitStatus === "submitting"}>
                    {submitStatus === "submitting" ? "Создаём сессию" : "Перейти к оплате"}
                  </Button>
                  <p className={styles.formFootnote}>Подтверждение СБП проходит на стороне платёжного провайдера. Возврат в браузер не зачисляет Coins сам по себе.</p>
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
              <p>Курс фиксируется в платёжной сессии. Баланс изменится только после подтверждения провайдера.</p>
            </aside>
          </div>
        )}
      </Container>
    </main>
  );
}
