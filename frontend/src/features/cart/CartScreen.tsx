"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Breadcrumbs, Button, Container, Skeleton, StatusBadge } from "@/components/ui/UI";
import { publicAssetPath } from "@/config/site";
import { getCartItemsLabel } from "@/lib/cart";
import { getProductStatusLabel } from "@/lib/catalog";
import { getProductVisualLabel } from "@/lib/product-visual";
import type { Product } from "@/types/commerce";

import styles from "./cart.module.css";

const kindLabel: Record<Product["kind"], string> = {
  skins: "Игровой предмет",
  steam: "Steam",
  gpt: "GPT",
};

function formatCoins(value: number) {
  return value.toLocaleString("ru-RU");
}

function CartMedia({ product }: { product: Product }) {
  if (product.image) {
    return (
      <Image
        src={publicAssetPath(product.image)}
        alt={product.imageAlt ?? ""}
        fill
        sizes="(max-width: 720px) 96px, 132px"
      />
    );
  }

  return (
    <span className={styles.serviceMedia} aria-hidden="true">
      <strong>{getProductVisualLabel(product)}</strong>
      <small>{product.productType}</small>
    </span>
  );
}

function HydratingCart() {
  return (
    <div className={styles.cartLayout} aria-label="Загрузка товаров корзины">
      <Skeleton className={styles.listSkeleton} />
      <Skeleton className={styles.summarySkeleton} />
    </div>
  );
}

export function CartScreen() {
  const {
    cart,
    balanceCoins,
    cartTotalCoins,
    cartShortfallCoins,
    hasSufficientBalance,
    requiresSteam,
    canPurchase,
    isAuthenticated,
    hasSteam,
    steamTradeUrl,
    isHydrated,
    removeFromCart,
    notify,
  } = useMarketplace();
  const router = useRouter();

  async function removeProduct(product: Product) {
    const removedIndex = cart.findIndex((item) => item.id === product.id);
    if (!await removeFromCart(product.id)) return;
    notify(`Товар «${product.title}» удалён из корзины.`);
    window.requestAnimationFrame(() => {
      const removeButtons = document.querySelectorAll<HTMLButtonElement>("button[data-cart-remove]");
      const nextButton = removeButtons.item(Math.min(removedIndex, removeButtons.length - 1));
      if (nextButton) nextButton.focus();
      else document.getElementById("empty-cart-catalog-link")?.focus();
    });
  }

  return (
    <main id="main-content" className={styles.cartPage}>
      <Container>
        <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Корзина" }]} />
        <div className={styles.pageHeading}>
          <div>
            <span className={styles.eyebrow}>Оформление заказа</span>
            <h1>Корзина</h1>
            <p>Проверьте товары и баланс Coins перед покупкой.</p>
          </div>
          {isHydrated && cart.length ? (
            <span className={styles.itemCounter}>{getCartItemsLabel(cart.length)}</span>
          ) : null}
        </div>
        <p className={styles.demoDisclosure}>
          <strong>Безопасное оформление</strong>
          Coins списываются только после подтверждения заказа.
        </p>
        {!isHydrated ? <HydratingCart /> : !cart.length ? (
          <section className={styles.emptyPanel} aria-labelledby="empty-cart-title">
            <span className={styles.emptyMark} aria-hidden="true">V</span>
            <div>
              <span>0 товаров</span>
              <h2 id="empty-cart-title">Корзина пуста</h2>
              <p>Добавьте товар из каталога — он появится здесь.</p>
              <Link id="empty-cart-catalog-link" className={styles.primaryLink} href="/catalog">Открыть каталог</Link>
            </div>
          </section>
        ) : (
          <div className={styles.cartLayout}>
            <section className={styles.cartItems} aria-labelledby="cart-items-title">
              <div className={styles.listHeading}>
                <div>
                  <span>Состав заказа</span>
                  <h2 id="cart-items-title">Ваши товары</h2>
                </div>
                <Link href="/catalog">Продолжить покупки</Link>
              </div>
              <ul>
                {cart.map((product) => (
                  <li key={product.id}>
                    <article className={styles.cartRow}>
                      <Link className={styles.rowMedia} href={`/catalog/${product.slug}`} aria-label={`Открыть товар «${product.title}»`}>
                        <CartMedia product={product} />
                      </Link>
                      <div className={styles.rowContent}>
                        <span className={styles.rowCategory}>{kindLabel[product.kind]}</span>
                        <h3><Link href={`/catalog/${product.slug}`}>{product.title}</Link></h3>
                        <p>{product.details.fulfillment.title}</p>
                        <div className={styles.rowMeta}>
                          {product.meta.slice(0, 2).map((meta) => <span key={meta}>{meta}</span>)}
                        </div>
                      </div>
                      <div className={styles.rowCommerce}>
                        <StatusBadge tone={product.availability === "available" ? "success" : "warning"}>
                          {getProductStatusLabel(product)}
                        </StatusBadge>
                        <p><strong>{formatCoins(product.priceCoins)}</strong> Coins</p>
                        <button
                          className={styles.removeButton}
                          data-cart-remove
                          type="button"
                          onClick={() => removeProduct(product)}
                          aria-label={`Удалить «${product.title}» из корзины`}
                        >
                          Удалить
                        </button>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            </section>

            <aside className={styles.summaryPanel} aria-labelledby="cart-summary-title">
              <span className={styles.summaryEyebrow}>Сводка</span>
              <h2 id="cart-summary-title">Ваш заказ</h2>
              <dl className={styles.summaryFacts} aria-live="polite">
                <div><dt>Товаров</dt><dd>{cart.length}</dd></div>
                <div><dt>Стоимость</dt><dd>{formatCoins(cartTotalCoins)} Coins</dd></div>
                <div><dt>Баланс</dt><dd>{formatCoins(balanceCoins)} Coins</dd></div>
              </dl>
              <div className={styles.summaryTotal}>
                <span>Итого</span>
                <p><strong>{formatCoins(cartTotalCoins)}</strong> Coins</p>
              </div>

              {!isAuthenticated ? (
                <div className={styles.authNotice} id="auth-required-note">
                  <strong>Войдите для работы с заказом</strong>
                  <span>После авторизации можно проверить баланс и продолжить локальное оформление.</span>
                </div>
              ) : requiresSteam && !hasSteam ? (
                <div className={styles.authNotice} id="steam-required-note">
                  <strong>Для этого заказа нужен Steam</strong>
                  <span>Steam обязателен для сохранения данных заказа игрового предмета.</span>
                </div>
              ) : requiresSteam && !steamTradeUrl ? (
                <div className={styles.authNotice} id="trade-url-required-note">
                  <strong>Добавьте Steam Trade URL</strong>
                  <span>Без персональной ссылки невозможно подготовить получение игрового предмета.</span>
                </div>
              ) : !hasSufficientBalance ? (
                <div className={styles.shortfallNotice} id="insufficient-coins-note">
                  <strong>Не хватает {formatCoins(cartShortfallCoins)} Coins</strong>
                  <span>Рассчитайте необходимое пополнение. Платёжный провайдер пока не подключён; товары останутся в корзине.</span>
                </div>
              ) : (
                <div className={styles.readyNotice}>
                  <strong>Можно создать локальный заказ</strong>
                  <span>После подтверждения останется {formatCoins(balanceCoins - cartTotalCoins)} Coins; внешняя выдача не запускается.</span>
                </div>
              )}

              <div className={styles.summaryActions}>
                {requiresSteam && hasSteam && !steamTradeUrl ? (
                  <Button
                    className={styles.primaryLink}
                    type="button"
                    aria-describedby="trade-url-required-note"
                    onClick={() => router.push("/account/steam?returnTo=%2Fcart")}
                  >
                    Добавить Steam Trade URL
                  </Button>
                ) : canPurchase ? (
                  <Button className={styles.primaryLink} type="button" onClick={() => router.push("/checkout")}>Перейти к оформлению</Button>
                  ) : !isAuthenticated ? (
                    <Button
                      className={styles.primaryLink}
                      type="button"
                      aria-describedby="auth-required-note"
                      onClick={() => router.push(`/auth?method=${requiresSteam ? "steam" : "email"}&returnTo=%2Fcart${requiresSteam ? "&required=steam" : ""}`)}
                    >
                      {requiresSteam ? "Войти через Steam" : "Войти в аккаунт"}
                    </Button>
                  ) : requiresSteam && !hasSteam ? (
                    <Button
                      className={styles.primaryLink}
                      type="button"
                      aria-describedby="steam-required-note"
                      onClick={() => router.push("/auth?method=steam&returnTo=%2Fcart&required=steam")}
                    >
                      Подключить Steam
                    </Button>
                  ) : !hasSufficientBalance ? (
                    <Button
                      className={styles.primaryLink}
                      type="button"
                      aria-describedby="insufficient-coins-note"
                      onClick={() => router.push(`/balance/top-up?returnTo=%2Fcart&requiredCoins=${cartShortfallCoins}`)}
                    >
                      Рассчитать {formatCoins(cartShortfallCoins)} Coins
                    </Button>
                  ) : (
                    <Button
                      className={styles.primaryLink}
                      type="button"
                      aria-describedby={requiresSteam ? "steam-required-note" : "auth-required-note"}
                      onClick={() => router.push(`/auth?method=${requiresSteam ? "steam" : "email"}&returnTo=%2Fcart${requiresSteam ? "&required=steam" : ""}`)}
                    >
                      {requiresSteam ? "Подключить Steam" : "Войти в аккаунт"}
                    </Button>
                  )}
              </div>
              <p className={styles.summaryFootnote}>Подтверждение создаёт локальную запись заказа и списание Coins.</p>
            </aside>
          </div>
        )}
      </Container>
    </main>
  );
}
