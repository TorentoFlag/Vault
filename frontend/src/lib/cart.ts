type CartProduct = {
  id: string;
  priceCoins: number;
};

export function createCheckoutLock() {
  let locked = false;

  return {
    acquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    reset() {
      locked = false;
    },
  };
}

export type CartSummary = {
  itemCount: number;
  totalCoins: number;
  balanceCoins: number;
  shortfallCoins: number;
  remainingCoins: number;
  canPurchase: boolean;
};

export function normalizeCartIds(
  ids: unknown[],
  products: { id: string }[],
) {
  const knownIds = new Set(products.map((product) => product.id));
  const uniqueIds = new Set<string>();

  for (const id of ids) {
    if (typeof id === "string" && knownIds.has(id)) uniqueIds.add(id);
  }

  return [...uniqueIds];
}

export function resolveCartProducts<T extends { id: string }>(products: T[], ids: string[]) {
  const productsById = new Map(products.map((product) => [product.id, product]));

  return ids.flatMap((id) => {
    const product = productsById.get(id);
    return product ? [product] : [];
  });
}

export function getCartSummary(products: CartProduct[], currentBalance: number): CartSummary {
  const balanceCoins = Math.max(0, Number.isFinite(currentBalance) ? currentBalance : 0);
  const totalCoins = products.reduce((total, product) => total + product.priceCoins, 0);
  const shortfallCoins = Math.max(0, totalCoins - balanceCoins);
  const remainingCoins = Math.max(0, balanceCoins - totalCoins);

  return {
    itemCount: products.length,
    totalCoins,
    balanceCoins,
    shortfallCoins,
    remainingCoins,
    canPurchase: products.length > 0 && shortfallCoins === 0,
  };
}

export function getCartItemsLabel(count: number) {
  const normalized = Math.max(0, Math.floor(count));
  const lastTwo = normalized % 100;
  const last = normalized % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? "товаров"
      : last === 1
        ? "товар"
        : last >= 2 && last <= 4
          ? "товара"
          : "товаров";

  return `${normalized} ${noun}`;
}
