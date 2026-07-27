"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, type ReactNode } from "react";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Button, StatusBadge } from "@/components/ui/UI";
import { publicAssetPath } from "@/config/site";
import { SupportCenter } from "@/features/support/SupportCenter";
import {
  getOverviewTransactions,
  getInventoryItems,
  getOrderItemDeliveryStatusLabel,
  getRelevantOrderRecipient,
  getTradeStatusLabel,
  getTransactionStatusLabel,
  sortOrdersNewestFirst,
} from "@/lib/account";
import type { CoinTransaction, MarketplaceOrder, TradeEvent } from "@/types/account";

import styles from "./account.module.css";
import { SteamTradeUrlForm } from "./SteamTradeUrlForm";

export type AccountSection = "overview" | "purchases" | "payments" | "inventory" | "steam" | "settings" | "support";

const orderStatus = {
  completed: { label: "Выполнен", tone: "success" as const },
  processing: { label: "Сохранён локально", tone: "warning" as const },
  cancelled: { label: "Отменён", tone: "neutral" as const },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatCoins(value: number) {
  return value.toLocaleString("ru-RU");
}

function ordersCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "заказов" : last === 1 ? "заказ" : last >= 2 && last <= 4 ? "заказа" : "заказов";
  return `${count} ${noun}`;
}

function itemsCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "предметов" : last === 1 ? "предмет" : last >= 2 && last <= 4 ? "предмета" : "предметов";
  return `${count} ${noun}`;
}

function SectionHeading({ label, title, description, action }: { label: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className={styles.sectionHeading}>
      <div><span>{label}</span><h2>{title}</h2><p>{description}</p></div>
      {action}
    </div>
  );
}

function OrderTable({ orders, compact = false }: { orders: MarketplaceOrder[]; compact?: boolean }) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  if (!orders.length) {
    return (
      <div className={styles.emptyState}>
        <span aria-hidden="true">0</span>
        <div><h3>Покупок пока нет</h3><p>Выберите товар в каталоге — заказ появится здесь после оформления.</p><Link className={styles.primaryLink} href="/catalog">Открыть каталог</Link></div>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.orderTable}>
        <caption className={styles.visuallyHidden}>История покупок Vault</caption>
        <thead><tr><th scope="col">Заказ</th><th scope="col">Товар</th><th scope="col">Стоимость</th><th scope="col">Статус</th><th scope="col">Действие</th></tr></thead>
        <tbody>
          {orders.map((order) => {
            const status = orderStatus[order.status];
            const isExpanded = expandedOrder === order.id;
            const recipient = getRelevantOrderRecipient(order.items, order.recipient);
            return (
              <Fragment key={order.id}>
              <tr className={styles.orderGroup}>
                <td data-label="Заказ"><span className={styles.cellStack}><strong>{order.number}</strong><time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time></span></td>
                <td data-label="Товар"><div className={styles.orderItems}>{order.items.map((item) => <Link key={item.id} href={`/catalog/${item.slug}`}>{item.title}</Link>)}</div></td>
                <td data-label="Стоимость" className={styles.coinCell}><span className={styles.coinValue}><strong>{formatCoins(order.totalCoins)}</strong> Coins</span></td>
                <td data-label="Статус"><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                <td data-label="Действие">
                  <button className={styles.detailsButton} type="button" aria-expanded={isExpanded} aria-controls={`order-details-${order.id}`} onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                    {isExpanded ? "Скрыть" : "Детали"}
                  </button>
                </td>
              </tr>
              {isExpanded ? (
                <tr className={styles.detailRow}>
                  <td colSpan={5}>
                    <div id={`order-details-${order.id}`} className={styles.inlineOrderDetails}>
                      <span>Данные локального заказа</span>
                      <p>{order.items.length === 1 ? order.items[0].title : `${order.items.length} товара в заказе`}</p>
                      <dl className={styles.orderDetailFacts}>
                        {recipient?.steamLogin ? <div><dt>Логин Steam</dt><dd>{recipient.steamLogin}</dd></div> : null}
                        {recipient?.steamTradeUrl ? <div><dt>Steam Trade URL заказа</dt><dd className={styles.breakableValue}>{recipient.steamTradeUrl}</dd></div> : null}
                        {recipient?.gptEmail ? <div><dt>Email получателя</dt><dd>{recipient.gptEmail}</dd></div> : null}
                        {order.items.map((item) => <div key={item.id}><dt>{item.title}</dt><dd>{getOrderItemDeliveryStatusLabel(item.deliveryStatus)}</dd></div>)}
                      </dl>
                      <div>
                        {order.items.map((item) => <Link key={item.id} href={`/catalog/${item.slug}`} aria-label={`Открыть товар «${item.title}»`}>Открыть товар</Link>)}
                        {order.items.some((item) => item.kind === "skins" && item.deliveryStatus === "inventory-ready") ? <Link href="/account/inventory">К инвентарю</Link> : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {compact ? null : <p className={styles.tableNote}>Новые заказы появляются здесь сразу после оформления.</p>}
    </div>
  );
}

function TransactionsTable({ transactions }: { transactions: CoinTransaction[] }) {
  const sorted = [...transactions].sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
  if (!sorted.length) return <div className={styles.emptyState}><span aria-hidden="true">0</span><div><h3>Операций пока нет</h3><p>Пополнения и покупки появятся здесь автоматически.</p></div></div>;

  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.orderTable} ${styles.paymentsTable}`}>
        <caption className={styles.visuallyHidden}>История операций Coins</caption>
        <thead><tr><th scope="col">Дата</th><th scope="col">Операция</th><th scope="col">Изменение</th><th scope="col">Баланс после</th><th scope="col">Статус</th></tr></thead>
        <tbody>{sorted.map((transaction) => (
          <tr key={transaction.id}>
            <td data-label="Дата"><time dateTime={transaction.createdAt}>{formatDate(transaction.createdAt)}</time></td>
            <td data-label="Операция"><span className={styles.cellStack}><strong>{transaction.reason === "top-up" ? "Пополнение баланса" : transaction.reason === "sale" ? "Продажа предмета" : "Покупка"}</strong><span>{transaction.orderNumber ?? "Coins"}</span></span></td>
            <td data-label="Изменение" className={transaction.status === "failed" ? undefined : transaction.direction === "credit" ? styles.credit : styles.debit}>{transaction.status === "failed" ? "Баланс не изменён" : `${transaction.direction === "credit" ? "+" : "−"}${formatCoins(transaction.amountCoins)} Coins`}</td>
            <td data-label="Баланс после" className={styles.coinCell}>{formatCoins(transaction.balanceAfterCoins)} Coins</td>
            <td data-label="Статус"><StatusBadge tone={transaction.status === "completed" ? "success" : "neutral"}>{getTransactionStatusLabel(transaction)}</StatusBadge></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function TradeLog({ events }: { events: TradeEvent[] }) {
  const labels = { purchase: "Покупка", sale: "Продажа сайту", withdrawal: "Вывод в Steam" } as const;
  const sorted = [...events].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return (
    <section className={styles.panel}>
      <SectionHeading label="Steam Trade" title="Лог торговых операций" description="Локальные записи заказов и действий с игровыми предметами." />
      {sorted.length ? (
        <div className={styles.tradeLog}>
          {sorted.map((event) => (
            <div key={event.id} className={styles.tradeLogRow}>
              <span className={styles.tradeLogDirection}>{event.direction === "purchase" ? "↓" : "↑"}</span>
              <div><strong>{labels[event.direction]}</strong><span>{event.title}</span></div>
              <small>{event.orderNumber ?? "Без номера"}</small>
              <StatusBadge tone={event.status === "completed" ? "success" : "neutral"}>{getTradeStatusLabel(event.status)}</StatusBadge>
            </div>
          ))}
        </div>
      ) : <p className={styles.mutedCopy}>Торговых операций пока нет.</p>}
    </section>
  );
}

function Overview() {
  const { balanceCoins, orders, transactions, tradeEvents, session, hasSteam, steamTradeUrl } = useMarketplace();
  const recentOrders = useMemo(() => sortOrdersNewestFirst(orders).slice(0, 3), [orders]);
  const inventory = useMemo(() => getInventoryItems(orders, tradeEvents), [orders, tradeEvents]);
  const activeOrders = orders.filter((order) => order.status === "processing").length;
  const recentTransactions = useMemo(() => getOverviewTransactions(transactions), [transactions]);

  return (
    <div className={styles.sectionStack}>
      <section className={styles.overviewStrip} aria-label="Состояние аккаунта">
        <div className={styles.balanceHero}><span>Доступно</span><strong>{formatCoins(balanceCoins)} <small>Coins</small></strong><Link href="/balance/top-up">Пополнить</Link></div>
        <dl>
          <div><dt>Заказов</dt><dd>{orders.length}</dd></div>
          <div><dt>Без внешней выдачи</dt><dd>{activeOrders}</dd></div>
          <div><dt>В инвентаре</dt><dd>{inventory.length}</dd></div>
        </dl>
        <div className={styles.accountReadiness}><span>Настройки аккаунта</span><strong>{hasSteam && steamTradeUrl ? "Данные Steam настроены" : "Нужна настройка Steam"}</strong><small>Email {session?.emailAccount ? "подтверждён" : "не подключён"} · Steam {hasSteam ? "подключён" : "не подключён"}</small><Link href="/account/steam">Проверить Steam</Link></div>
      </section>

      <section className={styles.panel}>
        <SectionHeading label="История" title="Последние покупки" description="Номер, товар, стоимость и текущий статус." action={<Link href="/account/purchases">Все покупки</Link>} />
        <OrderTable orders={recentOrders} compact />
      </section>

      <div className={styles.twoColumns}>
        <section className={styles.panel}>
          <SectionHeading label="Coins" title="Последние операции" description="Только движения внутреннего баланса." action={<Link href="/account/payments">Вся история</Link>} />
          {recentTransactions.length ? <div className={styles.compactTransactions}>{recentTransactions.map(({ transaction, amountLabel, direction }) => <div key={transaction.id}><span>{transaction.reason === "top-up" ? "Пополнение" : transaction.orderNumber ?? "Покупка"}<time dateTime={transaction.createdAt}>{formatDate(transaction.createdAt)}</time></span><strong data-direction={direction}>{amountLabel}</strong></div>)}</div> : <p className={styles.mutedCopy}>Операций Coins пока нет.</p>}
        </section>
        <section className={styles.panel}>
          <SectionHeading label="Предметы" title="Инвентарь" description="Игровые предметы из выполненных заказов." action={<Link href="/account/inventory">Открыть</Link>} />
          {inventory.length ? <div className={styles.inventoryMini}>{inventory.slice(0, 2).map((item) => <div key={item.id}>{item.image ? <span><Image src={publicAssetPath(item.image)} alt={item.imageAlt ?? ""} fill sizes="72px" /></span> : null}<p><strong>{item.title}</strong><small>{formatCoins(item.priceCoins)} Coins · Сохранено в локальном инвентаре</small></p></div>)}</div> : <p className={styles.mutedCopy}>Выполненных заказов с игровыми предметами пока нет.</p>}
        </section>
      </div>
      <TradeLog events={tradeEvents} />
    </div>
  );
}

function Purchases() {
  const { orders } = useMarketplace();
  const sortedOrders = useMemo(() => sortOrdersNewestFirst(orders), [orders]);
  return <section className={styles.panel}><SectionHeading label="Заказы" title="История покупок" description={`${ordersCountLabel(orders.length)} в истории покупок.`} action={<Link href="/catalog">Открыть каталог</Link>} /><OrderTable orders={sortedOrders} /></section>;
}

function Payments() {
  const { transactions } = useMarketplace();
  return <section className={styles.panel}><SectionHeading label="Баланс" title="Все операции Coins" description="Зачисления и списания без банковских реквизитов и фиатных сумм." action={<Link href="/balance/top-up">Пополнить</Link>} /><TransactionsTable transactions={transactions} /></section>;
}

function Inventory() {
  const { orders, tradeEvents, hasSteam, steamTradeUrl, sellInventoryItem, withdrawInventoryItem } = useMarketplace();
  const items = useMemo(() => getInventoryItems(orders, tradeEvents), [orders, tradeEvents]);
  const isSteamDataConfigured = hasSteam && !!steamTradeUrl;
  const withdrawalReason = !hasSteam
    ? "Вывод недоступен: подключите Steam-профиль."
    : !steamTradeUrl
      ? "Вывод недоступен: сохраните Steam Trade URL."
    : "Данные готовы, но отправка станет доступна после подключения обработки Steam Trade.";
  const saleReason = "Coins зачисляются сразу после локального подтверждения продажи.";

  return (
    <div className={styles.sectionStack}>
      <section className={styles.readinessPanel}>
        <div><span>Настройки Steam</span><h2>{isSteamDataConfigured ? "Данные Steam настроены" : "Завершите настройку Steam"}</h2><p>Профиль и Trade URL сохраняются локально. Внешняя передача предметов не подключена.</p></div>
        <dl><div><dt>Steam</dt><dd>{hasSteam ? "Подключён локально" : "Не подключён"}</dd></div><div><dt>Trade URL</dt><dd>{steamTradeUrl ? "Сохранён" : "Не добавлен"}</dd></div><div><dt>Передача</dt><dd>Не подключена</dd></div></dl>
        <Link className={styles.primaryLink} href="/account/steam">Профиль Steam</Link>
      </section>

      <section className={styles.panel}>
        <SectionHeading label="Настройки заказа" title="Steam Trade URL" description="Ссылка сохраняется для заказа игрового предмета. Пароль Steam не требуется." />
        <SteamTradeUrlForm returnTo="/account/inventory" />
      </section>

      <section className={styles.panel}>
        <SectionHeading label="Предметы" title="Инвентарь" description={`${itemsCountLabel(items.length)} из выполненных заказов.`} action={<Link href="/catalog?category=skins">К игровым предметам</Link>} />
        {items.length ? (
          <div className={styles.inventoryGrid}>
            {items.map((item, index) => {
              const saleReasonId = `sale-reason-${item.id}`;
              const withdrawalReasonId = `withdrawal-reason-${item.id}`;
              return (
                <article key={item.id}>
                  <Link className={styles.inventoryMedia} href={`/catalog/${item.slug}`} aria-label={`Открыть товар «${item.title}»`}>
                    {item.image ? <Image src={publicAssetPath(item.image)} alt={item.imageAlt ?? ""} fill sizes="(max-width: 720px) 100vw, 360px" priority={index === 0} /> : <span className={styles.inventoryFallback} aria-hidden="true">VLT</span>}
                  </Link>
                  <div className={styles.inventoryCardBody}>
                    <div className={styles.inventoryCardTopline}><span>Игровой предмет</span><StatusBadge tone={isSteamDataConfigured ? "success" : "warning"}>{isSteamDataConfigured ? "Настройки сохранены" : "Нужна настройка"}</StatusBadge></div>
                    <h3><Link href={`/catalog/${item.slug}`}>{item.title}</Link></h3>
                    <dl className={styles.inventoryMeta}>
                      <div><dt>Стоимость покупки</dt><dd>{formatCoins(item.priceCoins)} Coins</dd></div>
                      <div><dt>Заказ</dt><dd>{item.orderNumber}</dd></div>
                      <div><dt>Получен</dt><dd><time dateTime={item.acquiredAt}>{formatDate(item.acquiredAt)}</time></dd></div>
                    </dl>
                    <div className={styles.inventoryActions}>
                      <Button type="button" aria-describedby={saleReasonId} onClick={() => void sellInventoryItem(item.id)}>Продать сайту за Coins</Button>
                      <p id={saleReasonId}>{saleReason}</p>
                      <Button tone="secondary" type="button" aria-describedby={withdrawalReasonId} onClick={() => void withdrawInventoryItem(item.id)}>Вывести в Steam</Button>
                      <p id={withdrawalReasonId}>{withdrawalReason}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className={styles.emptyState}><span aria-hidden="true">0</span><div><h3>Инвентарь пуст</h3><p>Выполненные покупки игровых предметов появятся здесь.</p><Link className={styles.primaryLink} href="/catalog?category=skins">Игровые предметы</Link></div></div>}
      </section>
    </div>
  );
}

function SteamSettings({ returnTo }: { returnTo?: "/checkout" | "/cart" | null }) {
  const { session, hasSteam } = useMarketplace();
  const connectHref = returnTo === "/checkout"
    ? "/auth?method=steam&returnTo=%2Faccount%2Fsteam%3FreturnTo%3D%252Fcheckout"
    : returnTo === "/cart"
      ? "/auth?method=steam&returnTo=%2Faccount%2Fsteam%3FreturnTo%3D%252Fcart"
      : "/auth?method=steam&returnTo=%2Faccount%2Fsteam";

  return (
    <div className={styles.sectionStack}>
      <section className={styles.steamProfile}>
        <span className={styles.steamMark}>ST</span>
        <div><span>Steam-профиль</span><h2>{hasSteam ? session?.steamAccount?.displayName : "Steam не подключён"}</h2><p>{hasSteam ? `Steam ID: ${session?.steamAccount?.steamId}` : "Подключите локальную Steam-сессию для оформления игровых предметов."}</p></div>
        {hasSteam ? <StatusBadge>Подключён</StatusBadge> : <Link className={styles.primaryLink} href={connectHref}>Подключить Steam</Link>}
      </section>
      <section className={styles.panel}>
        <SectionHeading label="Настройки Steam" title="Steam Trade URL" description="Ссылка сохраняется для заказов игровых предметов. Пароль Steam не требуется." />
        <SteamTradeUrlForm returnTo={returnTo ?? "/account/steam"} />
      </section>
    </div>
  );
}

function Settings() {
  const { session, signOut, notify } = useMarketplace();
  const router = useRouter();
  async function logout() {
    if (!await signOut()) return;
    notify("Вы вышли из аккаунта Vault.");
    router.replace("/auth?returnTo=%2Faccount");
  }
  return (
    <div className={styles.sectionStack}>
      <section className={styles.panel}>
        <SectionHeading label="Доступ" title="Способы входа" description="Email и Steam подключаются к одному аккаунту Vault." />
        <div className={styles.connectionList}>
          <article><span>@</span><div><strong>Email</strong><p>{session?.emailAccount?.email ?? "Не подключён"}</p></div>{session?.emailAccount ? <StatusBadge>Подтверждён</StatusBadge> : <Link href="/auth?method=email&returnTo=%2Faccount%2Fsettings">Подключить</Link>}</article>
          <article><span>ST</span><div><strong>Steam</strong><p>{session?.steamAccount?.displayName ?? "Не подключён"}</p></div>{session?.steamAccount ? <StatusBadge>Подключён</StatusBadge> : <Link href="/auth?method=steam&returnTo=%2Faccount%2Fsettings">Подключить</Link>}</article>
        </div>
      </section>
      <section className={styles.dangerPanel}><div><span>Безопасность аккаунта</span><h2>Выйти из аккаунта</h2><p>История покупок, баланс и настройки Steam сохранятся в аккаунте.</p></div><Button tone="secondary" type="button" onClick={logout}>Выйти</Button></section>
    </div>
  );
}

export function AccountScreen({ section, returnTo }: { section: AccountSection; returnTo?: "/checkout" | "/cart" | null }) {
  if (section === "purchases") return <Purchases />;
  if (section === "payments") return <Payments />;
  if (section === "inventory") return <Inventory />;
  if (section === "steam") return <SteamSettings returnTo={returnTo} />;
  if (section === "settings") return <Settings />;
  if (section === "support") return <SupportCenter />;
  return <Overview />;
}
