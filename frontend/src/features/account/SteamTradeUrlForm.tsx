"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Button } from "@/components/ui/UI";
import { validateSteamTradeUrl } from "@/lib/account";

import styles from "./account.module.css";

export function SteamTradeUrlForm({ returnTo }: { returnTo: "/account/steam" | "/account/inventory" | "/checkout" | "/cart" }) {
  const router = useRouter();
  const { hasSteam, steamTradeUrl, saveSteamTradeUrl, notify } = useMarketplace();
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const value = draftValue ?? steamTradeUrl;
  const error = validateSteamTradeUrl(value);
  const checkoutConnectHref = "/auth?method=steam&returnTo=%2Faccount%2Fsteam%3FreturnTo%3D%252Fcheckout";
  const cartConnectHref = "/auth?method=steam&returnTo=%2Faccount%2Fsteam%3FreturnTo%3D%252Fcart";
  const connectHref = returnTo === "/checkout"
    ? checkoutConnectHref
    : returnTo === "/cart"
      ? cartConnectHref
      : `/auth?method=steam&returnTo=${encodeURIComponent(returnTo)}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    setSaved(false);
    if (error || !hasSteam) return;
    if (!await saveSteamTradeUrl(value)) return;
    setDraftValue(null);
    setSaved(true);
    notify("Steam Trade URL сохранён.");
    if (returnTo === "/checkout" || returnTo === "/cart") router.replace(returnTo);
  }

  return (
    <form className={styles.tradeForm} noValidate onSubmit={submit}>
      <label htmlFor={`steam-trade-url-${returnTo.split("/").at(-1)}`}>Ссылка обмена</label>
      <input
        id={`steam-trade-url-${returnTo.split("/").at(-1)}`}
        type="url"
        inputMode="url"
        autoComplete="url"
        placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
        value={value}
        disabled={!hasSteam}
        aria-invalid={touched && !!error}
        aria-describedby={`trade-url-help${touched && error ? " trade-url-error" : ""}`}
        onBlur={() => setTouched(true)}
        onChange={(event) => { setDraftValue(event.target.value); setSaved(false); }}
      />
      <p id="trade-url-help">Найдите ссылку в Steam: Инвентарь → Предложения обмена → Кто может отправлять мне предложения.</p>
      {!hasSteam ? <p className={styles.inlineWarning}>Сначала подключите Steam-профиль.</p> : null}
      {touched && error && hasSteam ? <p id="trade-url-error" className={styles.inlineError} role="alert">{error}</p> : null}
      {saved ? <p className={styles.inlineSuccess} role="status">Trade URL сохранён.{returnTo === "/checkout" ? " Возвращаем к оформлению заказа." : returnTo === "/cart" ? " Возвращаем в корзину." : ""}</p> : null}
      <div className={styles.tradeActions}>
        <Button type="submit" disabled={!hasSteam || !!error || value === steamTradeUrl}>Сохранить Trade URL</Button>
        {!hasSteam ? <Link className={styles.primaryLink} href={connectHref}>Подключить Steam</Link> : null}
      </div>
    </form>
  );
}
