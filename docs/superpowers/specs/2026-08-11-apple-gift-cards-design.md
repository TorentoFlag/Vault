# Vault Apple Gift Cards design

## Goal

Add App Store & iTunes gift cards as a manually fulfilled digital-goods category. A customer chooses the Apple-card region and nominal, verifies the delivery email by one-time password, pays with Coins, and receives order status and activation guidance in the Vault account. An administrator sources and releases the code manually. Plati.market is only a catalogue and UX reference; Vault neither integrates with it nor purchases codes automatically.

## Approved scope

- Sell only explicitly configured Apple-card variants: one region, currency, and nominal per catalogue product/variant.
- Show all customer-facing prices and order totals in Coins.
- Require a verified delivery email before Apple-card checkout. The existing frontend-only email concept becomes a backend-owned passwordless email session, so the same customer can later open their purchases.
- Send the OTP, order-accepted receipt, and later gift-card delivery email through Resend.
- Create one manual-fulfillment command for every purchased Apple-card line. No supplier API, scraping, browser automation, Plati integration, or automatic code issuance is in scope.
- Notify the configured Slack channel after the order is created and Coins are held. Slack never receives a gift-card code, an unmasked email address, an API key, or a webhook URL.
- Show Apple-card purchases in a dedicated digital-goods section of the account. It shows status, region, nominal, and activation instructions; it never reveals the gift-card code.
- Let an authorised administrator initiate delivery from the backend admin surface. The administrator manually obtains and enters the code; Vault sends the delivery email, records a redacted audit event, and transitions the order line only through the durable fulfillment path.

## Non-goals

- No automated supplier purchase, balance polling, stock synchronization, Plati integration, or supplier reconciliation.
- No direct card payment in this product flow. The existing Coins wallet checkout remains the payment mechanism.
- No guest checkout, locally stored order state, or client-side Resend/Slack credentials.
- No display, download, support-log, Slack-message, OpenAPI response, or analytics export containing a gift-card code.
- No change to Steam skin or Steam refill behavior beyond safely extending their shared checkout/order types.

## Catalogue and checkout

`CatalogProductKind` gains `apple_gift_card`. Product data has a stable `appleGiftCard` fulfillment descriptor containing the Apple region, card currency, nominal in the card currency minor units, and the versioned activation-guide identifier. A configured product is the only source for the displayed region and nominal; the browser never supplies a free-form nominal.

The product-detail experience presents the requested sequence:

1. Choose App Store & iTunes gift card.
2. Choose an available region.
3. Choose an available nominal.
4. Enter and verify the email that will receive the code.
5. Review the Coins total and accept the existing legal consent.
6. Confirm the wallet checkout.

The checkout snapshots a `delivery-email` recipient containing the normalized verified email and verification identity. Any recipient, cart, price, region, nominal, or session change invalidates the customer’s checkout confirmation. The order number used externally is a non-guessable public Vault order number, not a database UUID.

After checkout, the normal wallet hold and order/line records are created atomically with the `manual_apple_gift_card` fulfillment command and notification outbox rows. The browser is never the authority for payment, email sending, or fulfillment status.

## Email identity and messages

Email verification is passwordless authentication as well as checkout-contact verification. The backend stores normalized email identity, a salted hash of the OTP, expiration, attempt count, resend cooldown, origin/request metadata appropriate for abuse prevention, and consumed/cancelled state. It must not store an OTP in plaintext.

The OTP has a short configured lifetime, a configured resend cooldown, bounded failed attempts, and request limits by normalized email and IP. Responses must not reveal whether an email account existed earlier. Successful verification creates the standard HTTP-only server session and binds the verified contact to the checkout. A Steam customer may verify a delivery email without exposing Steam credentials in the email flow.

All messages have plain-text and accessible HTML versions, a Vault-branded subject/from address on the verified Vault domain, and no tracking pixel. The following customer content is fixed for the first release, with substitutions escaped and localized at rendering time.

### OTP email

```text
Здравствуйте!

Благодарим за регистрацию.

Для подтверждения адреса электронной почты введите код ниже:

Код подтверждения: {{OTP_CODE}}

Код действителен в течение {{OTP_EXPIRE_MINUTES}} минут.

Если вы не запрашивали подтверждение электронной почты, просто проигнорируйте это письмо. Никому не сообщайте код подтверждения.

С уважением,
Команда Vault
```

### Order-accepted email

This is queued only after the checkout transaction commits and creates the active Coins hold. `{{AMOUNT}}` is formatted in Coins, never in dollars or an inferred fiat conversion.

```text
Здравствуйте!

Спасибо за ваш заказ в Vault.

Мы получили вашу заявку и уже приступили к ее обработке. После проверки оплаты код подарочной карты будет отправлен на адрес электронной почты, указанный при оформлении заказа.

Информация о заказе:

Номер заказа: #{{ORDER_ID}}

Товар: {{PRODUCT_NAME}}

Сумма: {{AMOUNT}}

Дата оформления: {{DATE}}

Если у вас возникнут вопросы по заказу, пожалуйста, свяжитесь с нашей службой поддержки, ответив на это письмо или воспользовавшись контактами, указанными на сайте.

Благодарим за выбор Vault!

С уважением,
Команда Vault
```

### Gift-card delivery email

An administrator explicitly initiates this message after entering the manually sourced code in the protected admin flow. It includes the code, product name, region, nominal, order number, and the same activation guide. The code is never re-sent automatically; a replacement/resend requires a separate audited administrator action and a user-support reason.

## Manual fulfillment and order states

`manual_apple_gift_card` is a Vault-owned fulfillment command, not a supplier adapter. Its initial `pending` status means paid from the customer’s available Coins into an active hold and awaiting an administrator; it does not claim that a code exists or was sent.

An authorised admin uses a dedicated, token-protected endpoint and page rather than a generic database edit. The command requires an idempotency key and a reason. The action writes, in one transaction:

- a provider-independent fulfillment attempt with operation `manual_code_delivery`;
- encrypted gift-card-code material or an encrypted code envelope, accessible only to the delivery worker;
- an immutable audit record with the acting admin and reason but no plaintext code;
- an outbox row for the code-delivery email.

The delivery worker makes the Resend request outside the database transaction. A successful accepted send marks the manual delivery attempt successful and the order line `supplier_finished`, then captures the existing Coins hold according to the existing terminal settlement rules. A transient sending failure leaves the command retryable with the same idempotency key. A permanent send failure, invalid manually entered code, unavailable stock, or customer dispute moves the line to `manual_review`; it must not silently capture the hold. A reasoned admin recovery may later resend, replace, or fail/release according to the documented support policy.

## Account experience and activation guide

The account gains a separate “Цифровые товары” listing and detail route for Apple-card purchases. It is user-scoped and server-backed. Before delivery it shows “Ожидает ручной выдачи”; after delivery it shows “Отправлено на подтверждённый email”; on review it gives an honest support instruction. It must not put the code in HTML, JSON, page source, browser storage, screenshot fixture, or support list.

The Apple-card detail includes this guide:

- **На iPhone или iPad:** App Store → profile → «Погасить подарочную карту или код» → sign in if required → «Введите код вручную» → enter the received code → «Погасить».
- **На Mac:** App Store → name in the lower-left corner → «Погасить подарочную карту» → enter the code manually → confirm.
- **Важная информация:** use the code only on the intended Apple ID; the Apple ID region must match the purchased card; retain the code until activation succeeds; do not transfer it to third parties; contact Vault support with the order number and problem description when activation fails.

The product page repeats the region-matching warning before checkout. Apple’s territory-specific terms are linked from the product/legal copy once the set of supported regions is configured.

## Notifications and operational safety

The notification module owns `notification_outbox`, send attempts, and Resend webhook inbox records. Checkout writes `apple_gift_card.order_accepted` and `apple_gift_card.slack_alert` transactionally. Workers claim events with leases, retry safely, and persist the Resend email id or Slack result in redacted form.

Resend is configured with a backend-only `RESEND_API_KEY_FILE`, verified sending domain/from address, and `RESEND_WEBHOOK_SECRET_FILE`. Each message has a deterministic application idempotency key such as `email-verification/<challenge-id>` or `apple-card-order-accepted/<order-id>`. Resend webhook signature verification uses the untouched raw body; the inbox deduplicates `svix-id` and retains event type, timestamp, email id, tags, and safe bounce metadata. `sent` means accepted by Resend, while `delivered` only means accepted by the recipient mail server and is not proof the customer read or redeemed a code.

Slack uses a backend-only `SLACK_APPLE_ORDERS_WEBHOOK_URL_FILE`. The incoming message has order number, product, region, nominal, Coins amount, order time, masked recipient email, and the secure admin action URL. It never contains the code. Slack notification failure is visible in the admin operations queue and does not prevent a durable order from being created or fulfilled.

## Data protection and audit rules

- Email addresses are personal data; expose them only to the customer and authorised administrators, and mask them in Slack and generic operations views.
- Encrypt stored gift-card material with an application encryption key loaded from a separate secret file. Never hash a code as the only representation because the delivery worker needs the original material, and never persist plaintext code in logs or response snapshots.
- Redact bodies and headers before logging provider/notification attempts. Do not put code material in OpenAPI examples, test fixtures, error messages, analytics, or database outbox payloads visible to generic operators.
- Manual delivery/replacement/failure actions require actor, reason, idempotency key, order/line id, and timestamps in the audit trail.

## Testing and acceptance

- Unit tests cover variant validation, integer Coins prices, OTP expiration/attempts/cooldown, templates in both formats, masked-email formatting, code encryption/redaction, and state transitions.
- Integration tests cover verified email session → Apple checkout → wallet hold and durable commands/outbox → admin manual delivery → Resend retry/idempotency → terminal hold capture; plus permanent failure/manual review/release paths.
- Webhook tests cover raw-body signature validation, duplicate `svix-id`, out-of-order email events, bounce/suppression, and no mutation of payment/fulfillment state from an email delivery event.
- Admin tests prove unauthorised access is denied, idempotency collisions are safe, reasons are required, and all externally visible data remains redacted.
- Frontend tests and browser tests cover region/nominal selection, required email verification, consent reset after a selection change, account listing with no code, status copy, and both activation-guide layouts.
- Run backend OpenAPI generation/check, frontend API sync, backend/frontend unit/type/lint/build gates, and the relevant integration/commerce smoke additions.
- Before release, verify the Resend domain DNS and send a controlled test to a recipient mailbox; verify a real signed Resend webhook, controlled Slack alert, and a complete manually entered test-code delivery without exposing the test code in evidence.

## Explicit release blockers

- Final supported Apple regions, currencies, nominals, Coins prices, product imagery, and stock/fulfillment operating procedure.
- Vault sending domain, sender address, Resend account API key and webhook secret, plus DNS verification.
- Slack destination and secret webhook URL.
- Application encryption-key storage/rotation procedure for stored gift-card codes.
- Legal/offer review of manual resale, refund/replacement policy, regional Apple-card restrictions, customer support contact, and retention/deletion policy for delivery emails and audit records.
