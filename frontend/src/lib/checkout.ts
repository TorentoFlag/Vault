export type CheckoutGate =
  | "empty"
  | "insufficient"
  | "auth-required"
  | "steam-required"
  | "trade-url-required"
  | "ready";

export type CheckoutGateInput = {
  itemCount: number;
  totalCoins: number;
  balanceCoins: number;
  isAuthenticated: boolean;
  requiresSteam: boolean;
  hasSteam: boolean;
  hasTradeUrl?: boolean;
};

export function getCheckoutGate(input: CheckoutGateInput): CheckoutGate {
  if (input.itemCount <= 0) return "empty";
  if (!input.isAuthenticated) return "auth-required";
  if (input.requiresSteam && !input.hasSteam) return "steam-required";
  if (input.requiresSteam && !input.hasTradeUrl) return "trade-url-required";
  if (input.balanceCoins < input.totalCoins) return "insufficient";
  return "ready";
}

export function canSubmitCheckout(gate: CheckoutGate, accepted: boolean) {
  return gate === "ready" && accepted;
}

export type CheckoutReviewKeyInput = {
  revision: number;
  sessionSignature: string;
  cartIds: string[];
  steamTradeUrl: string;
  steamLogin: string;
  gptEmail: string;
};

export function createCheckoutReviewKey(input: CheckoutReviewKeyInput) {
  return JSON.stringify([
    input.revision,
    input.sessionSignature,
    input.cartIds,
    input.steamTradeUrl,
    input.steamLogin,
    input.gptEmail,
  ]);
}
