export type SihCatalogGame = "cs2" | "rust" | "tf2";

export type SihSupplierItem = {
  availableQuantity: number;
  game: SihCatalogGame;
  imageUrl: string | null;
  marketHashName: string;
  priceMicrousd: bigint;
};

export type SihSteamCheckResult = {
  transactionId: string;
};

export type SihSteamPayResult = {
  cashbackUsd: bigint;
  paymentAmountRub: bigint;
  status: "success";
};

export type SihFailureDisposition = "permanent" | "retryable";
