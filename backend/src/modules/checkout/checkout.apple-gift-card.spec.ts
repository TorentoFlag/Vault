import { describe, expect, it } from "vitest";

import { CheckoutService } from "./checkout.service";

describe("CheckoutService Apple gift cards", () => {
  it("requires a verified delivery email instead of a Steam recipient", async () => {
    const catalog = {
      getBySlug: () => Promise.resolve({
        id: "apple_us_25",
        slug: "apple-usd-25",
        kind: "apple_gift_card",
        title: "Apple Gift Card 25 USD",
        availability: "available",
        price: { amountMinor: 2500 },
      }),
    };
    const service = new CheckoutService({} as never, catalog as never, {} as never, {} as never, {} as never);

    await expect((service as never as { prepareLines: (userId: string, steamId64: undefined, email: undefined, items: unknown[]) => Promise<unknown> }).prepareLines(
      "user_1", undefined, undefined, [{ productSlug: "apple-usd-25", quantity: 1 }],
    )).rejects.toMatchObject({ code: "DELIVERY_EMAIL_REQUIRED" });
  });
});
