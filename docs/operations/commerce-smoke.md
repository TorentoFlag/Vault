# Commerce Smoke

Status: deterministic local/integration gate

Run:

```sh
npm --prefix backend run smoke:commerce
```

The smoke test uses the integration PostgreSQL database from `VAULT_TEST_DATABASE_URL`, or defaults to `postgres://vault_test:vault_test_password@localhost:55433/vault_test`.

## What It Proves

- A Steam-linked customer session can create an Arc Pay top-up session.
- Arc Pay top-up reconciliation credits Coins only after a captured provider payment is observed.
- Server cart and checkout can create one mixed order with a Steam-traded skin and a Steam account refill.
- Checkout creates wallet hold and durable SIH fulfillment commands.
- SIH skin `create-order` creates provider attempt evidence before submission.
- Admin fulfillment reconciliation polls SIH `get-order` and moves the skin line to completed state through the fulfillment state machine.
- SIH Steam refill `check` and `pay` complete the refill line through the fulfillment state machine.
- The wallet hold is captured, the order becomes fulfilled, and user-facing wallet, order, inventory, and trade-history projections reflect the result.
- Captured request evidence does not include Arc Pay secret keys. Persisted fulfillment/provider snapshots do not expose Steam Trade URL secrets.

## What It Does Not Prove

- It is not live provider acceptance.
- It does not prove a real bank payment, real Steam refill, real SIH purchase, or real Steam trade delivery.
- It does not replace the SIH sandbox catalog acceptance test or the Arc Pay trusted-HTTPS browser/webhook acceptance path.

## When To Run

Run this after changes to wallet, payments, cart, checkout, fulfillment, admin recovery, current-user history projections, or provider adapters.
