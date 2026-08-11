"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Breadcrumbs, Button, Container, Skeleton } from "@/components/ui/UI";
import { Icon } from "@/components/ui/Icon";
import {
  buildSteamAuthStartUrl,
  validateEmail,
  type AuthMethod,
  type AuthReturnPath,
} from "@/lib/auth";
import { createApiClient } from "@/lib/api";

import styles from "./auth.module.css";

type AuthStatus = "idle" | "loading" | "success" | "error";

function gameItemsLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? "игровых предметов"
      : last === 1
        ? "игровой предмет"
        : last >= 2 && last <= 4
          ? "игровых предмета"
          : "игровых предметов";
  return `${count} ${noun}`;
}

export function AuthScreen({
  initialMethod,
  returnTo,
  steamRequired,
}: {
  initialMethod: AuthMethod;
  returnTo: AuthReturnPath | null;
  steamRequired: boolean;
}) {
  const {
    cart,
    session,
    isHydrated,
    isAuthenticated,
    hasSteam,
    signOut,
    notify,
  } = useMarketplace();
  const router = useRouter();
  const [method, setMethod] = useState<AuthMethod>(initialMethod);
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [formError, setFormError] = useState("");
  const [email, setEmail] = useState("");
  const [emailChallengeId, setEmailChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const submitLock = useRef(false);
  const steamTabRef = useRef<HTMLButtonElement>(null);
  const emailTabRef = useRef<HTMLButtonElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  const skinItems = cart.filter((product) => product.kind === "skins");
  const requiresSteamNow = steamRequired || ((returnTo === "/cart" || returnTo === "/checkout") && skinItems.length > 0);
  const requestedProviderPresent = (initialMethod === "steam" && hasSteam)
    || (initialMethod === "email" && Boolean(session?.emailAccount));
  const isLoading = status === "loading";
  const steamAuthUrl = buildSteamAuthStartUrl(returnTo);

  useEffect(() => {
    if (status === "success") successRef.current?.focus();
  }, [status]);

  useEffect(() => {
    if (!isHydrated || !isAuthenticated || !returnTo || !requestedProviderPresent || (requiresSteamNow && !hasSteam)) return;
    router.replace(returnTo);
  }, [hasSteam, isAuthenticated, isHydrated, requestedProviderPresent, requiresSteamNow, returnTo, router]);

  function selectMethod(nextMethod: AuthMethod) {
    if (isLoading) return;
    submitLock.current = false;
    setMethod(nextMethod);
    setStatus("idle");
    setFormError("");
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextMethod: AuthMethod =
      event.key === "Home"
        ? "steam"
        : event.key === "End"
          ? "email"
          : event.key === "ArrowLeft"
            ? method === "steam" ? "email" : "steam"
            : method === "email" ? "steam" : "email";
    selectMethod(nextMethod);
    window.requestAnimationFrame(() => {
      (nextMethod === "steam" ? steamTabRef : emailTabRef).current?.focus();
    });
  }

  async function resetSession() {
    if (isLoading) return;
    if (!await signOut()) {
      setFormError("Не удалось безопасно завершить сессию: браузер не сохранил изменение.");
      return;
    }
    submitLock.current = false;
    setStatus("idle");
    setFormError("");
    notify("Вы вышли из аккаунта Vault.");
  }

  async function requestEmailCode() {
    const error = validateEmail(email);
    if (error) { setFormError(error); return; }
    if (submitLock.current) return;
    submitLock.current = true;
    setStatus("loading");
    setFormError("");
    try {
      const challenge = await createApiClient().requestEmailChallenge(email);
      setEmailChallengeId(challenge.id);
      setStatus("idle");
      notify("Код подтверждения отправлен на указанный email.");
    } catch {
      setStatus("error");
      setFormError("Не удалось отправить код. Проверьте email и повторите попытку.");
    } finally { submitLock.current = false; }
  }

  async function verifyEmailCode() {
    if (!emailChallengeId || !/^\d{6}$/.test(otp)) { setFormError("Введите шестизначный код из письма."); return; }
    if (submitLock.current) return;
    submitLock.current = true;
    setStatus("loading");
    setFormError("");
    try {
      await createApiClient().verifyEmailChallenge(emailChallengeId, otp);
      setStatus("success");
      notify("Email подтверждён.");
      if (returnTo) router.replace(returnTo);
      else router.replace("/account");
      router.refresh();
    } catch {
      setStatus("error");
      setFormError("Код недействителен или срок его действия истёк. Запросите новый код.");
    } finally { submitLock.current = false; }
  }

  return (
    <main id="main-content" className={styles.page}>
      <Container>
        <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Вход" }]} />
        <div className={styles.pageHeading}>
          <span>Аккаунт Vault</span>
          <h1>Войти в Vault</h1>
          <p>Сохраняйте покупки, баланс Coins и настройки заказов в одном аккаунте.</p>
        </div>
        <p className={styles.demoDisclosure}>
          <strong>Безопасный вход</strong>
          Войдите через Steam для игровых предметов или подтвердите email для цифровых товаров.
        </p>

        {!isHydrated ? (
          <div className={styles.layout} aria-label="Загрузка способов входа">
            <Skeleton className={styles.authSkeleton} />
            <Skeleton className={styles.contextSkeleton} />
          </div>
        ) : (
          <div className={styles.layout}>
            <section className={styles.authCard} aria-labelledby="auth-method-title">
              <div className={styles.cardHeading}>
                <span>Способ входа</span>
                <h2 id="auth-method-title">Выберите способ входа</h2>
              </div>

              <div className={styles.tabs} role="tablist" aria-label="Способ авторизации">
                <button
                  ref={steamTabRef}
                  id="auth-tab-steam"
                  type="button"
                  role="tab"
                  aria-selected={method === "steam"}
                  aria-controls="auth-panel-steam"
                  tabIndex={method === "steam" ? 0 : -1}
                  data-active={method === "steam" || undefined}
                  disabled={isLoading}
                  onClick={() => selectMethod("steam")}
                  onKeyDown={handleTabKeyDown}
                >
                  <Icon name="steam" width="21" height="21" />
                  <span><strong>Steam</strong><small>Для игровых предметов</small></span>
                </button>
                <button
                  ref={emailTabRef}
                  id="auth-tab-email"
                  type="button"
                  role="tab"
                  aria-selected={method === "email"}
                  aria-controls="auth-panel-email"
                  tabIndex={method === "email" ? 0 : -1}
                  data-active={method === "email" || undefined}
                  disabled={isLoading}
                  onClick={() => selectMethod("email")}
                  onKeyDown={handleTabKeyDown}
                >
                  <span className={styles.mailMark}>@</span>
                  <span><strong>Email</strong><small>Для цифровых товаров</small></span>
                </button>
              </div>

              {status === "success" ? (
                <div className={styles.successState} role="status">
                  <span className={styles.successMark}>✓</span>
                  <div>
                    <span>Аккаунт активен</span>
                    <h2 ref={successRef} tabIndex={-1}>Вход выполнен</h2>
                    <p>{method === "steam" ? "Steam-профиль активирован." : "Аккаунт активирован."}</p>
                    {returnTo ? (
                      <p className={styles.returnNote}>Возвращаем в предыдущий раздел…</p>
                    ) : (
                      <div className={styles.successActions}>
                        <Link className={styles.primaryLink} href="/catalog">Открыть каталог</Link>
                        <Link href="/cart">Перейти в корзину</Link>
                      </div>
                    )}
                  </div>
                </div>
              ) : method === "steam" ? (
                <div id="auth-panel-steam" role="tabpanel" aria-labelledby="auth-tab-steam" className={styles.panel} aria-busy={isLoading}>
                  <div className={styles.panelHeading}>
                    <span className={styles.steamMark}><Icon name="steam" width="30" height="30" /></span>
                    <div><h3>Проверить вход со Steam</h3><p>Подключите Steam-профиль для игровых покупок и получения предметов.</p></div>
                  </div>
                  <div className={styles.trustRow}>
                    <Icon name="shield" width="21" height="21" />
                    <span><strong>Пароль остаётся в Steam</strong>Vault никогда не запрашивает и не получает пароль Steam.</span>
                  </div>
                  {hasSteam ? (
                    <div className={styles.connectedAccount}>
                      <span>Подключено</span>
                      <strong>{session?.steamAccount?.displayName}</strong>
                      <p>Steam ID: {session?.steamAccount?.steamId}</p>
                    </div>
                  ) : null}
                  {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
                  {hasSteam ? (
                    <div className={styles.connectedActions}>
                      <Link className={styles.primaryLink} href="/catalog">Открыть каталог</Link>
                      <Link href="/cart">Перейти в корзину</Link>
                    </div>
                  ) : (
                    <>
                      <Link className={styles.mainButton} href={steamAuthUrl} aria-disabled={isLoading}>
                        Войти через Steam
                      </Link>
                      <p className={styles.panelFootnote}>Вход подтверждается в защищённом окне Steam.</p>
                    </>
                  )}
                  <p className={styles.panelFootnote}>Подключение сохраняет Steam-профиль для настройки заказов игровых предметов.</p>
                </div>
              ) : (
                <div id="auth-panel-email" role="tabpanel" aria-labelledby="auth-tab-email" className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <span className={styles.emailMark}>@</span>
                    <div><h3>Вход по email</h3><p>Подтвердите адрес одноразовым кодом — он нужен для доставки цифровых товаров.</p></div>
                  </div>
                  {session?.emailAccount ? (
                    <>
                      <div className={styles.connectedAccount}>
                        <span>Подтверждено</span>
                        <strong>{session.emailAccount.email}</strong>
                        <p>Email привязан к аккаунту Vault.</p>
                      </div>
                      <div className={styles.connectedActions}>
                        <Link className={styles.primaryLink} href="/catalog">Открыть каталог</Link>
                        <Link href="/cart">Перейти в корзину</Link>
                      </div>
                      <p className={styles.panelFootnote}>Выйти или сменить аккаунт можно в блоке состояния справа.</p>
                    </>
                  ) : emailChallengeId ? (
                    <>
                      {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
                      <label className={styles.fieldLabel} htmlFor="email-otp">Код из письма</label>
                      <input id="email-otp" className={styles.fieldInput} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} disabled={isLoading} />
                      <Button className={styles.mainButton} type="button" onClick={() => void verifyEmailCode()} disabled={isLoading}>
                        Подтвердить email
                      </Button>
                      <button className={styles.textButton} type="button" onClick={() => { setEmailChallengeId(null); setOtp(""); setFormError(""); }}>Изменить email</button>
                    </>
                  ) : (
                    <>
                      {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
                      <label className={styles.fieldLabel} htmlFor="auth-email">Email</label>
                      <input id="auth-email" className={styles.fieldInput} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isLoading} />
                      <Button className={styles.mainButton} type="button" onClick={() => void requestEmailCode()} disabled={isLoading}>
                        Получить код
                      </Button>
                      <p className={styles.panelFootnote}>Для игровых предметов дополнительно потребуется Steam-вход.</p>
                    </>
                  )}
                </div>
              )}
            </section>

            <aside className={styles.contextCard} aria-labelledby="auth-context-title">
              {requiresSteamNow && !hasSteam ? (
                <div className={styles.requiredContext}>
                  <span>Требование заказа</span>
                  <h2 id="auth-context-title">Для этого заказа нужен Steam</h2>
                  <p>{returnTo === "/cart" ? "После входа вернём вас в корзину." : "После входа можно продолжить оформление игровых предметов."}</p>
                  {skinItems.length ? <strong>{gameItemsLabel(skinItems.length)}</strong> : null}
                </div>
              ) : (
                <>
                  <span>Возможности аккаунта</span>
                  <h2 id="auth-context-title">Зачем входить</h2>
                  <ul>
                    <li><strong>История покупок</strong><span>Заказы и доступные действия</span></li>
                    <li><strong>Баланс Coins</strong><span>Один баланс на всех страницах</span></li>
                    <li><strong>Игровые предметы</strong><span>Steam-настройки и статус заказа</span></li>
                  </ul>
                </>
              )}
              {isAuthenticated ? (
                <div className={styles.sessionStatus}>
                  <span>Сессия активна</span>
                  <strong>{session?.steamAccount?.displayName ?? session?.emailAccount?.email}</strong>
                  <div>
                    <span>Email {session?.emailAccount ? "подтверждён" : "не подключён"}</span>
                    <span>Steam {session?.steamAccount ? "подключён" : "не подключён"}</span>
                  </div>
                  <button type="button" disabled={isLoading} onClick={resetSession}>Выйти</button>
                </div>
              ) : <p className={styles.localNote}>История покупок, баланс Coins и настройки профиля доступны после входа.</p>}
            </aside>
          </div>
        )}
      </Container>
    </main>
  );
}
