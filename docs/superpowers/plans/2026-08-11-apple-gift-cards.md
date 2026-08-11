# Apple Gift Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell region- and nominal-specific App Store & iTunes gift cards through the Coins wallet, verify the customer email with Resend, and complete delivery only when an administrator manually releases a code.

**Architecture:** Extend the current catalog/checkout/order aggregate with an `apple_gift_card` product kind and a `delivery-email` snapshot. Add backend email identities and OTP challenges, a generic durable notification outbox with Resend and Slack adapters, and a manual Apple fulfillment record encrypted at rest. The administrator explicitly enters a sourced code; a notification worker sends it and only then completes the existing fulfillment command and captures the wallet hold.

**Tech Stack:** NestJS 11, PostgreSQL/Drizzle, Node 20, `resend` Node SDK, Slack Incoming Webhooks, existing HTTP-only cookie sessions, CSRF/idempotency helpers, existing Coins wallet and fulfillment command tables, Next.js 16/React 19/TypeScript/CSS Modules.

## Global Constraints

- Plati.market is a visual/catalogue reference only: no integration, scraping, supplier API, automatic sourcing, or automatic code issuance.
- The customer pays in integer Coins minor units through the existing wallet checkout. No dollar symbol or client-side money arithmetic is introduced.
- Apple-card products are configured variants; the browser cannot submit a free-form region, currency, or nominal.
- A gift-card code is secret material: it must not appear in API responses, OpenAPI examples, client state, HTML, logs, error snapshots, Slack, test fixtures, or generic outbox payloads.
- Resend and Slack credentials, as well as the Apple-code encryption key, are backend-only secret files. Do not echo their contents.
- Every external delivery is driven by a durable outbox record with an application idempotency key. No HTTP call occurs in a database transaction.
- Use TDD: record the focused expected failure, implement the smallest change, then run focused tests before broader gates.
- Drizzle migrations are append-only. Modify `backend/drizzle/schema.ts`, run `npm --prefix backend run db:generate -- --name=apple-gift-cards`, and commit only the generated next migration/journal/snapshot; never edit prior migrations.
- Run `npm --prefix backend run openapi:generate`, `npm --prefix frontend run api:sync`, and frontend tests/typecheck whenever the backend OpenAPI contract changes.
- This plan deliberately has no commit commands: the repository requires a separate explicit request before committing.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `backend/src/modules/email-auth/**` | Passwordless email identity, OTP challenge request/verification, session creation, abuse limits. |
| `backend/src/modules/notifications/**` | Resend/Slack adapters, renderers, durable outbox, attempts, webhook inbox, worker. |
| `backend/src/modules/apple-gift-cards/**` | Gift-card variant parsing, encrypted manually entered code, customer digital-goods projection, admin delivery command. |
| `backend/src/modules/fulfillment/fulfillment.service.ts` | Creates the `manual_apple_gift_card` command and settles it only after notification dispatch succeeds. |
| `backend/src/modules/checkout/checkout.service.ts` | Requires and snapshots verified delivery email for each Apple-card line. |
| `backend/src/modules/catalog/**` | Normalizes Apple-card metadata and exposes only configured variants. |
| `backend/drizzle/schema.ts` + generated migration | Durable email, notification, encrypted-code, and public-order-number storage. |
| `frontend/src/features/checkout/**` | Region/nominal summary, email OTP verification, consent invalidation, checkout submission. |
| `frontend/src/features/account/**` | Customer-visible digital-goods list/detail and activation instructions without codes. |
| `frontend/src/lib/api.ts` + generated contract | Validates new backend routes and redacted DTOs. |

## Shared interfaces

```ts
export type AppleGiftCardDetails = {
  fulfillment: CatalogFulfillmentDetails;
  appleGiftCard: {
    currency: string;
    nominalMinor: number;
    regionCode: string;
    regionLabel: string;
  };
  specifications: CatalogProductSpecification[];
};

export type CheckoutRecipientSnapshot =
  | { kind: "steam-trade"; steamId64: string; steamTradePartnerAccountId: string }
  | { kind: "steam-refill"; steamLogin: string }
  | { kind: "delivery-email"; email: string; verificationId: string };

export type ManualAppleGiftCardDeliveryCommand = {
  actorId: string;
  code: string;
  idempotencyKey: string;
  orderLineId: string;
  reason: string;
};

export type DigitalGoodDto = {
  id: string;
  orderNumber: string;
  productSlug: string;
  title: string;
  regionLabel: string;
  nominalDisplay: string;
  status: "awaiting_manual_delivery" | "sent_to_email" | "needs_review" | "failed";
  purchasedAt: string;
  activationGuide: "apple_app_store_itunes_v1";
};
```

### Task 1: Durable schema, generic identity, and catalog contract

**Files:**
- Modify: `backend/drizzle/schema.ts`
- Create: generated `backend/drizzle/migrations/0015_apple_gift_cards.sql` and generated Drizzle metadata
- Modify: `backend/src/modules/catalog/catalog.types.ts`
- Modify: `backend/src/modules/catalog/catalog.service.ts`
- Modify: `backend/src/modules/users/users.service.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`
- Test: `backend/src/modules/catalog/catalog.service.spec.ts`
- Test: `backend/src/modules/users/users.service.spec.ts`
- Test: `backend/src/modules/auth/auth.persistence.integration.spec.ts`

**Interfaces:**
- Produces `CatalogProductKind = "steam" | "skins" | "apple_gift_card"` and `AppleGiftCardDetails` for checkout/frontend tasks.
- Produces generic `CustomerUser` with `steam: { connected: boolean; steamId64?: string }` and optional verified email identity.
- Produces database tables `email_identities`, `email_verification_challenges`, `notification_outbox`, `notification_attempts`, `notification_webhook_events`, `apple_gift_card_fulfillments`, and `order_public_numbers`.

- [ ] **Step 1: Write focused failing catalog and identity tests**

```ts
it("returns an Apple-card variant only when its immutable region and nominal metadata are complete", async () => {
  const product = await catalog.getBySlug("apple-usd-25");
  expect(product.kind).toBe("apple_gift_card");
  expect(product.details.appleGiftCard).toEqual({
    currency: "USD", nominalMinor: 2500, regionCode: "US", regionLabel: "США",
  });
});

it("creates an email-only customer without pretending it has Steam", async () => {
  const user = await users.upsertEmailUser("buyer@example.com");
  expect(user.steam.connected).toBe(false);
  expect(user.email).toEqual({ address: "buyer@example.com", verified: true });
});
```

- [ ] **Step 2: Run the focused tests to observe the missing types/schema failure**

Run: `npm --prefix backend test -- src/modules/catalog/catalog.service.spec.ts src/modules/users/users.service.spec.ts`

Expected: FAIL because `apple_gift_card`, `appleGiftCard`, and `upsertEmailUser` do not exist.

- [ ] **Step 3: Add schema declarations and generate the migration**

Define the tables with these minimum constraints:

```ts
emailIdentities: { email: text().primaryKey(), userId: text().unique().notNull(), verifiedAt: timestamp().notNull() }
emailVerificationChallenges: {
  id: uuid().defaultRandom().primaryKey(), email: text().notNull(), codeDigest: text().notNull(),
  purpose: text().notNull(), expiresAt: timestamp().notNull(), attemptCount: integer().default(0).notNull(),
  resendAvailableAt: timestamp().notNull(), consumedAt: timestamp(), createdAt: timestamp().defaultNow().notNull(),
}
appleGiftCardFulfillments: {
  orderLineId: uuid().primaryKey(), deliveryEmail: text().notNull(), regionCode: text().notNull(),
  currency: text().notNull(), nominalMinor: integer().notNull(), codeCiphertext: text(), codeNonce: text(),
  codeAuthTag: text(), codeVersion: text(), deliveryVersion: integer().default(0).notNull(),
}
```

Make `users.steam_id64` nullable, preserve the unique index, and update user queries so Steam-specific paths explicitly reject an email-only user. Generate the migration with:

```sh
npm --prefix backend run db:generate -- --name=apple-gift-cards
```

- [ ] **Step 4: Implement normalized variant and user identity boundaries**

Implement an `isAppleGiftCardDetails` type guard used on both database reads and product creation. `upsertEmailUser(normalizedEmail, existingUserId?)` creates/reuses an email identity; it attaches to an authenticated existing user only when that email is not already linked to another user. `upsertSteamUser(identity, existingUserId?)` preserves an existing matching email user when Steam is unlinked, otherwise returns the owner of the existing Steam identity.

- [ ] **Step 5: Run focused tests and migration-lineage checks**

Run:

```sh
npm --prefix backend test -- src/modules/catalog/catalog.service.spec.ts src/modules/users/users.service.spec.ts
npm --prefix backend run typecheck
npm --prefix backend run openapi:check
```

Expected: PASS; old Steam tests still prove Steam-only checkout cannot use an email-only user.

### Task 2: Passwordless email challenge and checkout-contact verification

**Files:**
- Create: `backend/src/modules/email-auth/email-auth.module.ts`
- Create: `backend/src/modules/email-auth/email-auth.controller.ts`
- Create: `backend/src/modules/email-auth/email-auth.service.ts`
- Create: `backend/src/modules/email-auth/email-auth.types.ts`
- Create: `backend/src/modules/email-auth/email-auth.service.spec.ts`
- Create: `backend/src/modules/email-auth/email-auth.integration.spec.ts`
- Modify: `backend/src/modules/auth/auth.module.ts`
- Modify: `backend/src/modules/sessions/session-cookies.ts`
- Modify: `backend/src/modules/checkout/checkout.service.ts`
- Modify: `backend/src/modules/checkout/checkout.integration.spec.ts`

**Interfaces:**
- Consumes `UsersService.upsertEmailUser()` and `SessionsService.createSession()` from Task 1.
- Produces `POST /auth/email/challenges` and `POST /auth/email/challenges/{challengeId}/verify`.
- Produces `EmailAuthService.requireVerifiedEmail(userId): { email: string; verificationId: string }` used by checkout.

- [ ] **Step 1: Write failing OTP lifecycle tests**

```ts
it("accepts the correct unexpired code once and creates a cookie session", async () => {
  const challenge = await emailAuth.requestChallenge({ email: "Buyer@Example.com", ip: "203.0.113.9" });
  const completed = await emailAuth.verifyChallenge({ challengeId: challenge.id, code: "123456", presentedSessionToken: null });
  expect(completed.email).toBe("buyer@example.com");
  await expect(emailAuth.verifyChallenge({ challengeId: challenge.id, code: "123456", presentedSessionToken: null }))
    .rejects.toMatchObject({ status: 401 });
});

it("rejects Apple checkout without a verified delivery email", async () => {
  await expect(checkout.checkoutFromCart(appleCartWithoutEmail)).rejects.toMatchObject({ code: "DELIVERY_EMAIL_REQUIRED" });
});
```

- [ ] **Step 2: Run focused test files**

Run: `npm --prefix backend test -- src/modules/email-auth/email-auth.service.spec.ts src/modules/checkout/checkout.integration.spec.ts`

Expected: FAIL because the email-auth module, routes, and `DELIVERY_EMAIL_REQUIRED` error do not exist.

- [ ] **Step 3: Implement challenge request and verification with bounded abuse controls**

Use `randomInt(100000, 1000000)` for a six-digit code, store `sha256(challengeSalt + code)`, set a 10-minute expiry, five verification attempts, and a 60-second resend cooldown. Keep rate counters in Redis keyed by SHA-256 of normalized email and IP, but persist the challenge lifecycle in PostgreSQL. Return `202 { challengeId, resendAvailableAt }` for request attempts without an account-existence distinction. On success, atomically consume the challenge, attach/create the email identity, and set `CUSTOMER_SESSION_COOKIE` using the existing secure cookie helper.

- [ ] **Step 4: Require the verified contact in checkout**

Extend `CheckoutRecipientSnapshot` with `delivery-email`. When `product.kind === "apple_gift_card"`, call `EmailAuthService.requireVerifiedEmail(userId)`, snapshot its email/challenge identity, and reject mixed carts if the session has no verified email. Preserve existing Steam trade and Steam refill branches unchanged.

- [ ] **Step 5: Verify controller, CSRF, and integration behavior**

Run:

```sh
npm --prefix backend test -- src/modules/email-auth/email-auth.service.spec.ts src/modules/email-auth/email-auth.integration.spec.ts src/modules/checkout/checkout.integration.spec.ts
npm --prefix backend run typecheck
```

Expected: PASS; expired, invalid, over-attempted, throttled, consumed, and recipient-less cases return safe Problem Details without OTP leakage.

### Task 3: Notifications foundation and Resend adapter

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `backend/src/config/app-config.ts`
- Modify: `backend/src/config/app-config.spec.ts`
- Create: `backend/src/modules/notifications/notifications.module.ts`
- Create: `backend/src/modules/notifications/notification-outbox.service.ts`
- Create: `backend/src/modules/notifications/resend.client.ts`
- Create: `backend/src/modules/notifications/email-templates.ts`
- Create: `backend/src/modules/notifications/resend-webhook.controller.ts`
- Create: `backend/src/modules/notifications/notifications.service.spec.ts`
- Create: `backend/src/modules/notifications/resend-webhook.controller.spec.ts`
- Create: `backend/src/notifications-worker.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes email challenge/order IDs; it receives only entity IDs and template parameters, never a gift-card code in outbox JSON.
- Produces `NotificationOutboxService.enqueue(client, { channel, eventType, idempotencyKey, entityId, payload })`.
- Produces `ResendClient.send(input): Promise<{ emailId: string }>` and `POST /webhooks/resend`.

- [ ] **Step 1: Add failing template and idempotency tests**

```ts
it("renders the approved OTP text in plain text and escaped HTML", () => {
  const message = renderEmailVerificationEmail({ code: "123456", expireMinutes: 10 });
  expect(message.text).toContain("Код подтверждения: 123456");
  expect(message.html).toContain("Команда Vault");
});

it("does not create a second notification attempt for the same outbox idempotency key", async () => {
  await outbox.enqueue(client, acceptedOrderEmail);
  await outbox.enqueue(client, acceptedOrderEmail);
  expect(await countRows("notification_outbox")).toBe(1);
});
```

- [ ] **Step 2: Run notification tests to observe missing module failure**

Run: `npm --prefix backend test -- src/modules/notifications/notifications.service.spec.ts src/modules/notifications/resend-webhook.controller.spec.ts`

Expected: FAIL because notification tables, templates, and adapter do not exist.

- [ ] **Step 3: Add the Resend SDK and typed secret-file configuration**

Run `npm --prefix backend install resend`. Extend `AppConfig` with:

```ts
notifications: {
  resendApiKeyFile?: string;
  resendFrom?: string;
  resendWebhookSecretFile?: string;
  slackAppleOrdersWebhookUrlFile?: string;
  appleGiftCardEncryptionKeyFile?: string;
}
```

Read secrets only at adapter construction; validate that production email sending requires the key file, a verified-domain from address, and a webhook secret. Do not add default production credentials.

- [ ] **Step 4: Implement durable send/retry and webhook inbox**

Claim outbox rows with `FOR UPDATE SKIP LOCKED`, persist an attempt before calling Resend, and use keys `email-verification/<challengeId>`, `apple-card-order-accepted/<orderId>`, and `apple-card-delivery/<orderLineId>/<deliveryVersion>`. Record the returned Resend email id after successful API acceptance. Verify the raw body against the Svix headers before parsing the webhook; insert `svix-id` under a unique constraint; record `sent`, `delivered`, `bounced`, `failed`, `suppressed`, and `delivery_delayed` without changing wallet/fulfillment state.

- [ ] **Step 5: Run focused tests and manual worker help check**

Run:

```sh
npm --prefix backend test -- src/modules/notifications/notifications.service.spec.ts src/modules/notifications/resend-webhook.controller.spec.ts
npm --prefix backend run typecheck
npm --prefix backend run build
node backend/dist/notifications-worker.js --help
```

Expected: PASS; `--help` lists a finite batch limit and performs no network send.

### Task 4: Apple manual fulfillment, encrypted code material, and Slack alert

**Files:**
- Create: `backend/src/modules/apple-gift-cards/apple-gift-cards.module.ts`
- Create: `backend/src/modules/apple-gift-cards/apple-gift-cards.service.ts`
- Create: `backend/src/modules/apple-gift-cards/apple-gift-cards.crypto.ts`
- Create: `backend/src/modules/apple-gift-cards/apple-gift-cards.admin.controller.ts`
- Create: `backend/src/modules/apple-gift-cards/apple-gift-cards.service.spec.ts`
- Create: `backend/src/modules/apple-gift-cards/apple-gift-cards.integration.spec.ts`
- Modify: `backend/src/modules/fulfillment/fulfillment.service.ts`
- Modify: `backend/src/modules/fulfillment/fulfillment.service.spec.ts`
- Modify: `backend/src/modules/admin/admin.module.ts`
- Modify: `backend/src/modules/admin/admin.service.ts`
- Modify: `backend/src/modules/admin/admin.controller.ts`
- Modify: `backend/src/notifications-worker.ts`

**Interfaces:**
- Consumes `manual_apple_gift_card` commands and `NotificationOutboxService` from Tasks 1 and 3.
- Produces `GET /admin/apple-gift-cards/pending` and `POST /admin/apple-gift-cards/{orderLineId}/deliveries`.
- Produces `AppleGiftCardsService.completeDeliveryAfterAcceptedSend(notificationId, resendEmailId)` called only by the notification worker.

- [ ] **Step 1: Write failing manual-delivery transition tests**

```ts
it("queues a redacted code-delivery email and captures Coins only after Resend accepts it", async () => {
  const result = await appleCards.recordManualDelivery({ orderLineId, code: "ABCD-1234-EFGH", reason: "Код проверен у поставщика", actorId: "admin_1", idempotencyKey: "deliver-1" });
  expect(result.status).toBe("queued");
  expect(await orderLineStatus(orderLineId)).toBe("held");
  expect(await notificationPayload(result.notificationId)).not.toContain("ABCD-1234-EFGH");
  await appleCards.completeDeliveryAfterAcceptedSend(result.notificationId, "re_123");
  expect(await orderLineStatus(orderLineId)).toBe("supplier_finished");
});
```

- [ ] **Step 2: Run focused fulfillment tests**

Run: `npm --prefix backend test -- src/modules/apple-gift-cards/apple-gift-cards.service.spec.ts src/modules/fulfillment/fulfillment.service.spec.ts`

Expected: FAIL because the manual command and secure delivery API do not exist.

- [ ] **Step 3: Enqueue manual Apple commands at checkout and create the admin flow**

Add `manual_apple_gift_card` to `FulfillmentCommandType`; insert it with `provider = 'manual'`, stable command idempotency `${orderId}:${lineId}:manual_apple_gift_card`, and a payload that contains region/nominal/delivery-email identity but no code. The protected delivery endpoint requires `X-Admin-Token`, CSRF is not applicable to token-only machine/admin API access, `Idempotency-Key`, code length 8–128 after trim, and a 10–500 character reason. It returns only `{ status: "queued", notificationId }`.

- [ ] **Step 4: Encrypt, audit, dispatch, and settle**

Encrypt code material using AES-256-GCM and the configured `APPLE_GIFT_CARD_ENCRYPTION_KEY_FILE`; store `ciphertext`, `nonce`, `authTag`, key version, and monotonically incremented `deliveryVersion`. In the same transaction create a `manual_code_delivery` provider attempt, audit record `admin.apple_gift_card.delivery_queued`, and `apple-card-delivery` outbox event whose payload contains only IDs. Add `apple_card.slack_alert` at checkout, rendered as Block Kit with order number, region, nominal, Coins amount, masked email, and an admin URL. The Slack adapter POSTs only to the secret-file URL and has a redacted result record. On Resend accepted-send completion, mark attempt/command/line terminal and call existing settlement; on permanent send failure set command/line/order to `manual_review` without capture.

- [ ] **Step 5: Run admin/security and integration tests**

Run:

```sh
npm --prefix backend test -- src/modules/apple-gift-cards/apple-gift-cards.service.spec.ts src/modules/apple-gift-cards/apple-gift-cards.integration.spec.ts src/modules/fulfillment/fulfillment.service.spec.ts
npm --prefix backend run typecheck
```

Expected: PASS; duplicate delivery is idempotent, unauthorised calls fail, a code is absent from all returned JSON/audit/outbox snapshots, and a bounce does not reopen/capture a completed command.

### Task 5: Customer digital-goods projection and OpenAPI contract

**Files:**
- Create: `backend/src/modules/apple-gift-cards/digital-goods.controller.ts`
- Modify: `backend/src/modules/apple-gift-cards/apple-gift-cards.service.ts`
- Modify: `backend/src/modules/apple-gift-cards/apple-gift-cards.module.ts`
- Modify: `backend/src/openapi.spec.ts`
- Modify: `backend/openapi.json` through `npm --prefix backend run openapi:generate`
- Modify: `frontend/src/generated/api-contract.json` through `npm --prefix frontend run api:sync`
- Modify: `frontend/src/lib/api.ts`
- Test: `backend/src/modules/apple-gift-cards/apple-gift-cards.integration.spec.ts`
- Test: `frontend/src/lib/api.test.ts`

**Interfaces:**
- Produces `GET /digital-goods/me` returning `{ items: DigitalGoodDto[] }`, guarded by `CustomerSessionGuard`.
- Produces API validators that reject any DTO containing `code`, `ciphertext`, `nonce`, `authTag`, or administrative details.

- [ ] **Step 1: Write failing projection and client-validator tests**

```ts
expect(await request(app.getHttpServer()).get("/digital-goods/me").set("Cookie", customerCookie)).toMatchObject({
  status: 200,
  body: { items: [expect.objectContaining({ status: "awaiting_manual_delivery", activationGuide: "apple_app_store_itunes_v1" })] },
});
expect(JSON.stringify(response.body)).not.toContain("code");
```

- [ ] **Step 2: Run the focused backend and frontend tests**

Run: `npm --prefix backend test -- src/modules/apple-gift-cards/apple-gift-cards.integration.spec.ts && npm --prefix frontend test -- src/lib/api.test.ts`

Expected: FAIL because `/digital-goods/me` and its client parser do not exist.

- [ ] **Step 3: Implement redacted projection and document it**

Select only user-owned Apple order lines and map `held` to `awaiting_manual_delivery`, completed manual delivery to `sent_to_email`, manual review to `needs_review`, and failed to `failed`. Return configured region/nominal/guide fields and neither recipient email nor secret material. Document the exact schema with Nest Swagger decorators.

- [ ] **Step 4: Generate contracts and write strict frontend parsing**

Run:

```sh
npm --prefix backend run openapi:generate
npm --prefix frontend run api:sync
```

Add `"/digital-goods/me"` to `apiPaths`, `ApiDigitalGood`, `isApiDigitalGood`, and `getDigitalGoods()`. Reject unknown statuses and reject records exposing sensitive keys.

- [ ] **Step 5: Run contract checks**

Run:

```sh
npm --prefix backend run openapi:check
npm --prefix backend test -- src/openapi.spec.ts src/modules/apple-gift-cards/apple-gift-cards.integration.spec.ts
npm --prefix frontend test -- src/lib/api.test.ts
npm --prefix frontend run typecheck
```

Expected: PASS; generated snapshots are fresh and code material cannot cross the public contract.

### Task 6: Frontend email authentication and Apple checkout UX

**Files:**
- Modify: `frontend/src/lib/auth.ts`
- Modify: `frontend/src/lib/fulfillment.ts`
- Modify: `frontend/src/lib/marketplace.ts`
- Modify: `frontend/src/types/commerce.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/marketplace/MarketplaceProvider.tsx`
- Modify: `frontend/src/features/auth/AuthScreen.tsx`
- Modify: `frontend/src/features/checkout/CheckoutScreen.tsx`
- Modify: `frontend/src/features/checkout/checkout.module.css`
- Modify: `frontend/src/features/catalog/CatalogScreen.tsx`
- Test: `frontend/src/lib/fulfillment.test.ts`
- Test: `frontend/src/lib/api.test.ts`
- Test: `frontend/src/features/checkout/CheckoutScreen.test.tsx` if a React test harness is added; otherwise cover deterministic logic in `lib` and browser QA in Task 8.

**Interfaces:**
- Consumes `/auth/email/challenges`, verification response/session cookie, Apple catalog metadata, and the existing `/checkout/cart` response.
- Produces an authenticated server-backed email session; no localStorage email identity remains for Apple products.

- [ ] **Step 1: Write failing deterministic UI-model tests**

```ts
assert.deepEqual(validateFulfillmentInput(["apple_gift_card"], { steamLogin: "", verifiedDeliveryEmail: null }), {
  verifiedDeliveryEmail: "Подтвердите email для получения кода.",
});
assert.equal(getProductVisualLabel(appleCardProduct), "Apple");
```

- [ ] **Step 2: Run frontend tests to observe unsupported product kind failure**

Run: `npm --prefix frontend test -- src/lib/fulfillment.test.ts src/lib/api.test.ts`

Expected: FAIL because `apple_gift_card`, verified email state, and API calls do not exist.

- [ ] **Step 3: Replace mock email sign-in with the server flow**

Create provider methods `requestEmailChallenge(email)` and `verifyEmailChallenge(challengeId, code)`. Maintain OTP entry state only in React component memory. On a successful verification, rehydrate `/session/me`, cart, wallet, and orders; never write OTP/email session data to localStorage. Add the email auth endpoints and guarded return paths to `apiPaths`/client methods.

- [ ] **Step 4: Render Apple variant selection and checkout requirements**

Render the product’s configured region and nominal as catalogue attributes. For an Apple-card cart, show the verified email field/state and OTP prompt before enabling checkout. Include explicit region-matching warning, reset legal consent when cart/recipient/session changes, and label fulfillment as manual delivery to confirmed email. Extend all product-kind maps, filters, visual labels, and server DTO parsers with `apple_gift_card`; retain GPT as unavailable.

- [ ] **Step 5: Run frontend unit/type/lint checks**

Run:

```sh
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS; no local email mock can satisfy Apple checkout and no UI path displays a code.

### Task 7: Digital-goods account surfaces and activation guide

**Files:**
- Create: `frontend/src/app/account/digital-goods/page.tsx`
- Create: `frontend/src/app/account/digital-goods/loading.tsx`
- Create: `frontend/src/app/account/digital-goods/error.tsx`
- Create: `frontend/src/features/account/DigitalGoodsScreen.tsx`
- Create: `frontend/src/features/account/digital-goods.module.css`
- Modify: `frontend/src/features/account/AccountScreen.tsx`
- Modify: `frontend/src/features/account/account.module.css`
- Modify: `frontend/src/components/marketplace/MarketplaceProvider.tsx`
- Test: `frontend/src/features/account/digital-goods.test.ts`

**Interfaces:**
- Consumes `ApiClient.getDigitalGoods(): Promise<ApiDigitalGood[]>` from Task 5.
- Produces `/account/digital-goods`, linked from account overview/purchases, with no code input/output.

- [ ] **Step 1: Write failing presentation-model tests**

```ts
it("shows manual-delivery state and the Apple guide without rendering any code field", () => {
  const view = buildDigitalGoodView(awaitingAppleGood);
  expect(view.statusLabel).toBe("Ожидает ручной выдачи");
  expect(view.instructions.some((line) => line.includes("Погасить подарочную карту или код"))).toBe(true);
  expect(JSON.stringify(view)).not.toMatch(/code|ciphertext|nonce/i);
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm --prefix frontend test -- src/features/account/digital-goods.test.ts`

Expected: FAIL because the digital-goods view model and route do not exist.

- [ ] **Step 3: Implement the customer route and guide**

Add a compact account-overview panel linking to `/account/digital-goods`. The screen lists title, order number, region, nominal, Coins purchase amount, date, and honest status. Its detail card renders the approved iPhone/iPad, Mac, and important-information activation guide. The post-delivery status says “Отправлено на подтверждённый email”; it does not offer a code reveal or resend button.

- [ ] **Step 4: Add loading/error states and accessibility details**

Make the route keyboard navigable, use semantic headings/lists, keep status changes in an `aria-live` region, and ensure error text says data remains protected without implying code delivery succeeded. Use existing CSS module visual language and mobile breakpoints.

- [ ] **Step 5: Run frontend validation**

Run:

```sh
npm --prefix frontend test -- src/features/account/digital-goods.test.ts
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Expected: PASS; empty, pending, sent-to-email, review, and failed states all render without a code.

### Task 8: Full integration gate, documentation, and controlled external acceptance

**Files:**
- Modify: `backend/src/smoke/commerce-flow.integration.spec.ts`
- Modify: `backend/src/provider-acceptance-readiness.ts`
- Modify: `backend/src/provider-acceptance-readiness.spec.ts`
- Modify: `docs/operations/provider-acceptance.md`
- Create: `docs/operations/apple-gift-card-manual-fulfillment.md`
- Modify: `docs/README.md`
- Modify: `docs/architecture/project-architecture.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces an executable deterministic smoke path and an explicit external release gate `resend-apple-gift-card`.

- [ ] **Step 1: Add a failing end-to-end commerce smoke scenario**

```ts
it("holds Coins, queues receipt and Slack events, and completes an Apple card only after manual delivery email acceptance", async () => {
  const order = await checkoutVerifiedAppleCard();
  expect(await walletHoldStatus(order.id)).toBe("active");
  await adminQueueManualDelivery(order.lineId, "ABCD-1234-EFGH");
  await runNotificationWorkerWithAcceptedResendFake();
  expect(await walletHoldStatus(order.id)).toBe("captured");
  expect(await customerDigitalGoods(order.userId)).toContainEqual(expect.objectContaining({ status: "sent_to_email" }));
});
```

- [ ] **Step 2: Run the smoke test and observe the first missing integration seam**

Run: `npm --prefix backend run smoke:commerce`

Expected: FAIL until the fixture creates a verified email identity and exercises the manual delivery worker.

- [ ] **Step 3: Implement deterministic smoke, readiness, and runbook**

Extend the smoke fixture with a fake Resend client and fake Slack endpoint that record redacted payloads. Add readiness checks for `RESEND_API_KEY_FILE`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET_FILE`, `SLACK_APPLE_ORDERS_WEBHOOK_URL_FILE`, `APPLE_GIFT_CARD_ENCRYPTION_KEY_FILE`, and a public HTTPS backend origin. Document operator steps: verify DNS, submit controlled OTP/receipt/delivery messages, validate a signed Resend webhook, inspect a masked Slack alert, manually enter a disposable test code, inspect DB rows/outbox/audit without reading the code, and record only nonsecret evidence.

- [ ] **Step 4: Run complete local verification**

Run:

```sh
npm --prefix backend run verify
npm --prefix backend run test:integration
npm --prefix backend run smoke:commerce
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
git diff --check
```

Expected: all deterministic gates PASS. `npm --prefix backend run acceptance:readiness` may remain blocked until authorised secrets/DNS/origins are supplied; report that state rather than treating fake tests as provider acceptance.

- [ ] **Step 5: Perform external acceptance only with explicit authority**

After the user supplies/authorises the Resend domain, controlled recipient, and Slack destination, run the readiness preflight, send only the controlled test emails, and verify the signed webhook plus Slack post. Do not deploy, rotate credentials, purchase a card, or send customer email as part of this task without separate explicit instruction.

## Plan self-review

| Specification requirement | Implementing tasks |
| --- | --- |
| Configured Apple catalogue, region, nominal, Coins price | 1, 6 |
| Backend passwordless email and OTP | 1, 2, 3, 6 |
| Exact customer email lifecycle through Resend | 3, 4, 8 |
| Manual-only code sourcing/release | 4, 8 |
| No code in account/Slack/logs/contracts | 3, 4, 5, 7, 8 |
| Account listing and activation guide | 5, 7 |
| Wallet hold/capture and recovery behavior | 2, 4, 8 |
| Slack order notification | 3, 4, 8 |
| Redaction, encryption, audit, idempotency, webhook verification | 1, 3, 4, 5, 8 |
| Documentation and real acceptance separation | 8 |

The plan has no deferred implementation marker: unknown commercial inputs are stated as release gates, not implicit development work. All cross-task names are defined in Shared interfaces or their producing task.
