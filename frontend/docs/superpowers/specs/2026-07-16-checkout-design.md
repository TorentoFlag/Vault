# Checkout Design

## Scope

Add the only missing page required by the full product specification: a dedicated `/checkout` route. Preserve the approved Home design system and all existing local mock behavior. Do not add APIs, payment providers, external writes, Git, or new dependencies.

## Selected approach

Use a dedicated checkout page. The cart remains the place for changing the order and resolving insufficient balance or authentication. Checkout becomes the final read-only review with the required legal acknowledgement and a single local purchase action.

Inline checkout was rejected because the full specification names Checkout separately and requires a legal checkbox before purchase. A modal was rejected because it weakens routing, loading/error handling, browser history, and mobile usability.

## User flow

1. A ready cart shows `Перейти к оформлению` and navigates to `/checkout`.
2. Checkout re-validates cart, Coins, authentication, and Steam requirements.
3. Invalid states show an explanation and a working link to the correct recovery step.
4. A valid order shows products, total, balance after purchase, delivery summary, and the exact acknowledgement from the specification.
5. The purchase button is disabled until the checkbox is selected.
6. Purchase uses the existing local `checkoutCart()` transaction and shows a receipt with links to purchase history and the catalog.

## Architecture

- `src/lib/checkout.ts` owns deterministic eligibility and acknowledgement helpers.
- `src/features/checkout/CheckoutScreen.tsx` owns the page state and calls the existing marketplace provider.
- `src/app/checkout` owns metadata, loading, and error boundaries.
- `CartScreen` stops mutating order state and only routes a ready user to checkout.
- `/checkout` becomes an allowed safe return path for authentication.

## States

- Loading: skeleton while marketplace local storage hydrates.
- Empty cart: link to catalog.
- Insufficient Coins: link to top-up, returning through cart.
- Authentication required: link to email or Steam login with safe `/checkout` return.
- Steam required: link to Steam authentication.
- Ready: order summary plus disabled acknowledgement-gated CTA.
- Submitting: disabled form with `Оформляем…`.
- Success: local order number, Coins spent, remaining balance, history/catalog actions.
- Error: inline recoverable message without losing the cart.

## Visual direction

Reuse the existing graphite surfaces, blue accent, Rajdhani labels, dense commerce typography, borders, status badges, and container width. Use a two-column desktop layout (order list plus sticky summary) and a single-column mobile layout. No new visual language, gradients, glass, illustrations, or generated imagery.

## Testing

- Unit tests cover all checkout eligibility states and the legal gate.
- Auth tests cover the safe `/checkout` return.
- Browser QA covers ready, disabled, selected, success, and mobile states.
- Final verification runs test, typecheck, lint, build, route checks, console checks, and overflow checks.

## Self-review

- No placeholders or unbounded features.
- No backend or real payment claims.
- Exact scope is one missing page plus its required cart/auth integration.
- Existing home and already approved page designs remain unchanged.
- No Git actions are permitted.
