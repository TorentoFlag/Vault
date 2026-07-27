"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { Container, Section } from "@/components/ui/UI";
import { siteConfig } from "@/config/site";
import { formatCoinRate, normalizeCalculatorAmount, summarizeSteamTopUp } from "@/lib/marketplace";

import styles from "./home.module.css";

const amounts = [500, 1000, 2500];

export function SteamTopUp() {
  const [amount, setAmount] = useState("1000");
  const normalizedAmount = normalizeCalculatorAmount(amount);
  const error = normalizedAmount < 100 ? "Укажите целую сумму от 100 ₽." : "";
  const summary = useMemo(() => summarizeSteamTopUp(error ? 0 : normalizedAmount, siteConfig.coin.rate), [error, normalizedAmount]);

  return (
    <Section id="steam-top-up" className={styles.steamSection}>
      <Container className={styles.steamLayout}>
        <div className={styles.steamIntro}>
          <div className={styles.steamEmblem}><Icon name="steam" width="62" height="62" /></div>
          <span className={styles.sectionCode}>STEAM WALLET</span>
          <h2>Калькулятор пополнения Steam</h2>
          <p>Сравните номинал и стоимость в Coins, затем откройте предложения Steam.</p>
          <div className={styles.steamFacts}>
            <span><Icon name="check" width="17" height="17" /> Расчёт по фиксированному курсу</span>
            <span><Icon name="shield" width="17" height="17" /> Внешнее зачисление не подключено</span>
          </div>
        </div>
        <div className={styles.steamForm}>
          <div className={styles.formGrid}>
            <label htmlFor="steam-top-up-amount">
              <span>Сумма</span>
              <div className={styles.amountInput}>
                <input
                  id="steam-top-up-amount"
                  type="number"
                  min="100"
                  step="100"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="numeric"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "steam-helper steam-error" : "steam-helper"}
                />
                <span>₽</span>
              </div>
            </label>
          </div>
          <div className={styles.amounts} aria-label="Быстрый выбор суммы">
            {amounts.map((value) => (
              <button type="button" key={value} onClick={() => setAmount(String(value))} aria-pressed={normalizedAmount === value}>
                {value.toLocaleString("ru-RU")} ₽
              </button>
            ))}
          </div>
          <p id="steam-helper" className={styles.helper}>
            Калькулятор не запрашивает данные аккаунта и не выполняет платёж.
          </p>
          {error ? <p id="steam-error" className={styles.formError} role="alert">{error}</p> : null}
          <div className={styles.steamSummary}>
            <div><span>К пополнению</span><strong>{summary.rubles.toLocaleString("ru-RU")} ₽</strong></div>
            <div><span>Стоимость</span><strong>{summary.coins.toLocaleString("ru-RU")} Coins</strong></div>
            <div><span>Курс</span><strong>{formatCoinRate(summary.rate)}</strong></div>
          </div>
          <Link className={styles.steamCatalogLink} href="/catalog?category=steam">Выбрать пополнение Steam</Link>
        </div>
      </Container>
    </Section>
  );
}
