# Wallet Reconciliation

Status: deterministic database invariant gate

Run:

```sh
npm --prefix backend run wallet:reconcile -- --limit=100
```

The command is read-only. It exits `0` when no wallet invariant issues are found and exits `1` when issues are present. Output is a JSON report intended for operators and agents.

## What It Checks

- Posted wallet transactions must have ledger entries.
- Posted wallet transactions must balance to `0` across all ledger entries.
- Active wallet holds must reference an existing order.
- Terminal orders with status `fulfilled`, `partially_fulfilled`, or `failed` must not still have an active wallet hold.
- Wallet holds must have positive `amount_coin_minor`.
- Wallet ledger entries must not be zero-value rows.

## What It Does Not Do

- It does not credit, debit, release, capture, or overwrite wallet state.
- It does not decide refunds, chargebacks, or provider disputes.
- It does not replace Arc Pay or SIH reconciliation.
- It does not make manual-review orders safe to close automatically.

## Operator Handling

When the command returns `issues_found`:

1. Preserve the JSON report as redacted incident evidence.
2. Inspect linked provider attempts, payment inbox rows, order lines, and audit events.
3. Use the narrowest existing recovery command when one exists.
4. If no recovery command exists, write the intended compensating action and add an audited command before changing money/order state.

Never patch `wallet_transactions`, `wallet_ledger_entries`, or `wallet_holds` manually as a first response. Posted financial history is append-only; corrections must be compensating entries or explicit audited recovery commands.
