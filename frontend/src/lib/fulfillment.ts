import { validateEmail } from "./auth.ts";
import type { ProductKind } from "./marketplace.ts";

export type FulfillmentInput = {
  steamLogin: string;
  gptEmail: string;
};

export type FulfillmentErrors = Partial<Record<keyof FulfillmentInput, string>>;

export function validateFulfillmentInput(kinds: ProductKind[], input: FulfillmentInput): FulfillmentErrors {
  const errors: FulfillmentErrors = {};
  if (kinds.includes("steam") && input.steamLogin.trim().length < 3) {
    errors.steamLogin = "Укажите логин Steam.";
  }
  if (kinds.includes("gpt")) {
    const error = validateEmail(input.gptEmail);
    if (error) errors.gptEmail = error;
  }
  return errors;
}
