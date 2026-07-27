# Agent Development Workflow

## Instruction layering

Root `AGENTS.md` contains durable routing and non-negotiable rules. Detailed architecture and procedures live under `docs/`.

If a subtree later needs durable specialized rules, add a small nested `AGENTS.md` in that subtree and link to the owning docs. Do not copy large architecture sections into instruction files.

## Context discipline

Before implementation, an agent must identify:

- exact task and non-goals;
- owned read/write paths;
- source-of-truth docs and interfaces;
- required tests and provider gates;
- whether the work is deterministic local work or real provider acceptance;
- unresolved product/architecture decisions.

The main thread owns product decisions, integration, final verification, and truthful reporting.

## Parallelism policy

Good parallel work:

- read-only research split by provider/module;
- independent frontend visual audit and backend architecture review;
- unrelated unit/integration test runs;
- separate review agents for security, maintainability, and product compliance;
- disjoint write work after interfaces and path ownership are fixed.

Bad parallel work:

- two agents editing one file/module/schema;
- concurrent migrations;
- one agent changing an interface while another implements a consumer;
- concurrent package/lockfile edits;
- generated OpenAPI/client changes in worker agents;
- deployment, secret rotation, staging, or commits by worker agents.

## Coordination ledger

For multi-agent work, create `.agents/coordination.md`:

```markdown
# Agent Coordination

| Task | Agent | Owned paths | Forbidden/shared paths | Dependencies | Status |
| --- | --- | --- | --- | --- | --- |
| Backend payment adapter | agent-a | backend/src/modules/payments/** | package*.json, migrations, generated OpenAPI | Provider decision #2 | active |
```

Rules:

- Only the coordinator edits `.agents/coordination.md`.
- Agents read the ledger and local file state before writing.
- Agents modify only owned paths.
- If an owned file changes unexpectedly, stop and report before continuing.
- The coordinator serializes shared files and commits.

## TDD and verification

Implementation tasks follow this loop:

1. Write the focused failing test.
2. Run it and capture the expected failure.
3. Implement the smallest production change.
4. Run the focused test and capture pass.
5. Run affected integration tests.
6. Run the package/repository gate.
7. Inspect the diff before reporting completion.

Do not claim provider success from mocks. Deterministic fakes are useful for error handling, recovery, and states that cannot be safely induced, but provider acceptance needs real sandbox/test evidence.

## Review protocol

Use two gates for meaningful implementation:

- Behavior/spec review: does the diff satisfy the approved requirement and invariants?
- Quality review: maintainability, security, operations, test strength, unnecessary complexity.

Review findings lead with bugs/risks and file references. Reviewers do not modify files unless assigned a separate fix task and path ownership.

## Provider evidence protocol

Provider evidence must record:

- environment used, without secret values;
- request purpose and correlation id;
- sanitized response shape/status;
- database rows proving durable attempt/inbox/outbox/domain effects;
- reconciliation result where money or fulfillment is involved;
- browser proof for user-visible behavior where relevant;
- exact skipped checks and blockers.

Never paste API keys, private keys, full Trade URLs with token, card data, session cookies, or raw sensitive provider payloads into docs.

## Long-running handoff

At a checkpoint record:

- approved goal/spec/plan task;
- completed commits and verification;
- current dirty paths and ownership;
- exact next action;
- external environment state/credentials required without secret values;
- unresolved blocker or decision.

Do not rely on conversation memory for repository truth.
