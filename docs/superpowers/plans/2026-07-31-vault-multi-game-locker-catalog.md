# Vault Multi-Game Locker Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task, or `superpowers:subagent-driven-development` if the coordinator explicitly splits independent path ownership in `.agents/coordination.md`.

**Goal:** Bring Vault catalog to the same game scope as Locker for first release: CS2, Rust, and Team Fortress 2 game items from SIH. Keep GPT refill hidden. Do not expose Dota 2 because Locker does not use it for this catalog path.

**Architecture:** SIH remains the supplier for purchasable item listings and fulfillment. A separate metadata layer owns customer-facing title, description, image, tags, category/type, and publication eligibility. The public catalog is built by joining active SIH supplier listings with game-specific metadata and publishing only items that satisfy the game publication policy.

**Tech Stack:** NestJS backend, PostgreSQL, Drizzle migrations/schema, existing raw `DatabaseService` query style, OpenAPI-generated frontend client, React/Vite frontend.

**Current Evidence:**
- Vault production currently has SIH supplier data only for `cs2`; `rust` and `tf2` are absent from `supplier_listings`.
- Vault backend already has partial SIH app-id support for `cs2`, `rust`, and `tf2`, but `CatalogSupplierSyncService.promoteProductsForGame()` disables every non-CS2 game.
- Vault has a CS2-only projection path: `createSihCs2CatalogProjection()` and `catalog-sync-cs2-images.ts`.
- Locker uses `cs2`, `rust`, and `tf2`, with metadata providers `csgo_api`, `scmm`, and `tf2_autobot`.

**Non-Negotiable Constraints:**
- Public game keys are exactly `cs2`, `rust`, `tf2`.
- No Dota 2 links, filters, counters, seed cards, or claims.
- No customer-facing dollar symbols.
- No mock catalog rows, localStorage balances, demo orders, or seed fallback cards in production UI.
- No generated fake descriptions or fake images. If required metadata is missing, the item stays unpublished.
- Secrets remain backend-only and are never logged or committed.
- No provider network call happens inside an open database transaction.
- Coins remain integer domain values; no floating-point price arithmetic.
- Existing CS2 Russian metadata behavior is preserved.
- Rust and TF2 should match Locker provider behavior first. UI chrome and category labels are Russian; item metadata language follows the real metadata provider unless a separate approved translation pipeline is added.

## Task 1: Add A Durable Catalog Game Model

**Files:**
- Create `backend/src/modules/catalog/catalog-game.ts`.
- Modify `backend/src/modules/catalog/catalog.types.ts`.
- Modify `backend/src/config/app-config.ts`.
- Add `backend/src/modules/catalog/catalog-game.spec.ts`.

**Implementation:**

Create a single backend source of truth for supported games:

```ts
export const CATALOG_GAMES = ["cs2", "rust", "tf2"] as const;
export type CatalogGame = (typeof CATALOG_GAMES)[number];

export type CatalogGameDefinition = {
  key: CatalogGame;
  label: string;
  steamAppId: number;
  sihAppId: number;
  metadataProvider: "csgo_api" | "scmm" | "tf2_autobot";
  metadataLocale: "ru" | "en";
  metadataRequiredForPublication: boolean;
};
```

Use definitions matching Locker:

```ts
cs2:  steamAppId 730,    provider csgo_api,     locale ru, metadataRequiredForPublication false
rust: steamAppId 252490, provider scmm,         locale en, metadataRequiredForPublication true
tf2:  steamAppId 440,    provider tf2_autobot,  locale en, metadataRequiredForPublication true
```

Add:
- `isCatalogGame(value): value is CatalogGame`
- `parseCatalogGame(value): CatalogGame | null`
- `getCatalogGameDefinition(game)`
- `parseCatalogPublicGames(raw: string | undefined): CatalogGame[]`

Config:
- Add `CATALOG_PUBLIC_GAMES`.
- Default development value: `cs2`.
- Production rollout value after acceptance: `cs2,rust,tf2`.
- Invalid values fail fast during backend startup.

**Tests:**

Write focused unit tests that prove:
- `cs2`, `rust`, `tf2` parse.
- Unknown values reject.
- Duplicates are removed while preserving configured order.
- Empty config falls back to `["cs2"]`.
- `dota2` is rejected.

**Acceptance Command:**

```bash
npm --prefix backend test -- catalog-game
```

## Task 2: Add Metadata Persistence

**Files:**
- Modify `backend/drizzle/schema.ts`.
- Add a new migration under `backend/drizzle/migrations/`.
- Create `backend/src/modules/catalog/catalog-metadata.types.ts`.
- Create `backend/src/modules/catalog/catalog-metadata.repository.ts`.
- Add `backend/src/modules/catalog/catalog-metadata.repository.integration.spec.ts`.

**Schema:**

Add `catalog_metadata_snapshots`:

```sql
id uuid primary key
provider text not null
game text not null
locale text not null
source_url text not null
source_hash text not null
observed_at timestamptz not null
item_count integer not null
filtered_count integer not null default 0
metadata jsonb not null default '{}'
created_at timestamptz not null default now()
unique(provider, game, locale, source_hash)
```

Add `catalog_metadata_items`:

```sql
provider text not null
game text not null
locale text not null
market_hash_name text not null
provider_item_id text
title text not null
description text
category_name text
product_type text
rarity_name text
image_url text
tags jsonb not null default '[]'
raw jsonb not null default '{}'
snapshot_id uuid not null references catalog_metadata_snapshots(id)
updated_at timestamptz not null default now()
primary key(provider, game, locale, market_hash_name)
```

Indexes:
- `(game, market_hash_name)`
- `(provider, game, locale)`
- `(updated_at)`

Repository operations:
- `createMetadataSnapshot(input)`
- `replaceMetadataItems(snapshotId, items)` using temp table or transaction-scoped batched upsert.
- `findMetadataForListings(game, marketHashNames)`
- `getLatestMetadataSnapshot(provider, game, locale)`
- `getMetadataCoverage(game, provider, locale)`

**Rules:**
- Repository may open database transactions for persistence.
- Provider fetch is completed before repository transaction starts.
- Raw provider payload is stored only for item-level audit/debugging; secrets are not part of payload.

**Tests:**

Use integration PostgreSQL test setup to prove:
- Replacing the same metadata item updates title/image/tags.
- `findMetadataForListings()` returns only requested game rows.
- Snapshot uniqueness prevents duplicate source snapshots.
- No Dota-compatible value is accepted by game parser before persistence.

**Acceptance Command:**

```bash
docker compose -f compose.dev.yaml --profile integration up -d --wait postgres-test redis-test
npm --prefix backend run test:integration -- catalog-metadata
```

## Task 3: Port Locker Metadata Providers Into Vault

**Files:**
- Create `backend/src/modules/catalog/providers/metadata/catalog-metadata-provider.ts`.
- Create `backend/src/modules/catalog/providers/metadata/catalog-metadata-provider.registry.ts`.
- Create `backend/src/modules/catalog/providers/csgo-api/csgo-api.client.ts`.
- Create `backend/src/modules/catalog/providers/scmm/scmm.client.ts`.
- Create `backend/src/modules/catalog/providers/tf2-autobot/tf2-autobot.client.ts`.
- Modify catalog module wiring.
- Add parser/client unit tests with fixtures.

**Provider Port:**

```ts
export type CatalogMetadataFetchCommand = {
  game: CatalogGame;
  locale: "ru" | "en";
  marketHashNames: readonly string[];
};

export type CatalogMetadataProviderResult = {
  provider: "csgo_api" | "scmm" | "tf2_autobot";
  game: CatalogGame;
  locale: "ru" | "en";
  sourceUrl: string;
  sourceHash: string;
  observedAt: Date;
  items: CatalogMetadataItemInput[];
};

export interface CatalogMetadataProvider {
  readonly provider: CatalogMetadataProviderResult["provider"];
  fetch(command: CatalogMetadataFetchCommand): Promise<CatalogMetadataProviderResult>;
}
```

Provider behavior:
- CS2: extract the current Vault CS2 image/metadata logic out of `catalog-sync-cs2-images.ts` and into `CsgoApiClient`.
- Rust: port Locker `ScmmClient` behavior and source URL.
- TF2: port Locker `Tf2AutobotClient` behavior and source URL.

Dependency decision:
- If Locker uses streaming JSON parsing for SCMM payload size, add the same dependency to Vault backend instead of loading a large provider JSON into memory.
- Package file changes are serialized and handled by the coordinator.

**Publication Metadata Requirements:**
- CS2 may publish with existing CS2 projection fallback only when title, category, and image are available from supplier or metadata; it must not display the generic `CS2 / Steam item` placeholder.
- Rust requires metadata title and image.
- TF2 requires metadata title and image.
- Descriptions must come from provider metadata or deterministic, product-specific formatting from the provider fields. Do not use Lorem Ipsum, generic “Steam item”, or generated filler.

**Tests:**

Add fixtures proving:
- CS2 parser maps a known market hash to Russian-facing title/category/image.
- Rust SCMM parser maps market hash, image, category/type, and tags.
- TF2 Autobot parser maps market hash, image, quality/type, and tags.
- Registry returns the provider from `CatalogGameDefinition.metadataProvider`.

**Acceptance Commands:**

```bash
npm --prefix backend test -- csgo-api
npm --prefix backend test -- scmm
npm --prefix backend test -- tf2-autobot
npm --prefix backend test -- catalog-metadata-provider
```

## Task 4: Replace CS2-Only Promotion With Generic Publication

**Files:**
- Modify `backend/src/modules/catalog/catalog-supplier-sync.service.ts`.
- Modify `backend/src/modules/catalog/catalog-product-projection.ts`.
- Create `backend/src/modules/catalog/catalog-publication.service.ts`.
- Update `backend/src/catalog-sync-sih.ts`.
- Create `backend/src/catalog-sync-metadata.ts`.
- Retire or convert `backend/src/catalog-sync-cs2-images.ts` into a compatibility wrapper that calls metadata sync for `cs2`.
- Update supplier sync tests.

**Implementation:**

Remove the non-CS2 disable guard:

```ts
if (game !== "cs2") {
  ...
  return 0;
}
```

Replace it with generic flow:

1. `catalog:sync-sih -- --game=<game>` fetches active SIH listings for that game and stores them in `supplier_listings`.
2. It creates or updates product shells with `public_enabled=false`.
3. `catalog:sync-metadata -- --game=<game>` fetches metadata via the configured metadata provider and writes metadata tables.
4. `CatalogPublicationService.promoteGame(game)` publishes products where:
   - supplier listing exists and is active,
   - supplier provider is `sih`,
   - price is positive in Coins,
   - game is in `CATALOG_PUBLIC_GAMES`,
   - required metadata is present for that game,
   - image URL is present,
   - title is not a generic placeholder,
   - description is present or produced from provider-specific fields.
5. Products no longer satisfying the rule are unpublished, not deleted.

Projection rules:
- `catalog_products.game` stores canonical game keys: `cs2`, `rust`, `tf2`.
- API/frontend maps keys to labels: `CS2`, `Rust`, `Team Fortress 2`.
- Existing uppercase `CS2` product rows are migrated to `cs2` in the same migration or one focused migration before generic publication.

**Tests:**

Update integration tests to prove:
- SIH sync stores `cs2`, `rust`, `tf2` listings.
- Sync alone does not publish Rust/TF2 without metadata.
- Metadata + supplier listing publishes Rust.
- Metadata + supplier listing publishes TF2.
- Dota input is rejected before any DB write.
- Missing image keeps product unpublished.
- Product with generic placeholder title stays unpublished.
- Product losing active supplier listing becomes unpublished.

**Acceptance Commands:**

```bash
npm --prefix backend run test:integration -- catalog-supplier-sync
npm --prefix backend run test:integration -- catalog-publication
npm --prefix backend run typecheck
```

## Task 5: Extend Catalog API Contract For Game Filtering

**Files:**
- Modify `backend/src/modules/catalog/catalog.controller.ts`.
- Modify `backend/src/modules/catalog/catalog.service.ts`.
- Modify `backend/src/modules/catalog/catalog.types.ts`.
- Update backend OpenAPI generation.
- Update catalog API tests.

**API Changes:**

Add query parameter:

```ts
game?: "cs2" | "rust" | "tf2"
```

Add response facet:

```ts
games: Array<{
  key: "cs2" | "rust" | "tf2";
  label: string;
  count?: number;
}>
```

Sorting:
- Accept Locker-style `price_asc`, `price_desc`, `newest`, `name_asc`, `name_desc`.
- Keep current Vault aliases `price-asc` and `price-desc` as backward-compatible input only.
- Frontend emits Locker-style underscore values.

Search:
- Exact game terms map to game filter:
  - `cs2`
  - `кс`
  - `rust`
  - `раст`
  - `tf2`
  - `team fortress`
- Query still searches product title, description, tags, and market hash name.

Behavior:
- `GET /catalog?category=skins&game=rust` returns only Rust items.
- `GET /catalog?category=skins` returns enabled public games mixed, sorted by requested sort.
- `GET /catalog?game=dota2` returns validation error.
- `GET /catalog?category=steam&game=rust` returns validation error because game filters apply only to skins/game items.

**Tests:**

Add controller/service tests for:
- Valid game filters.
- Invalid game rejection.
- Sort alias compatibility.
- Facets contain exactly enabled games.
- No Dota facet.

**Acceptance Commands:**

```bash
npm --prefix backend test -- catalog
npm --prefix backend run openapi:generate
npm --prefix backend run openapi:check
npm --prefix frontend run api:sync
```

## Task 6: Update Frontend Catalog To Match Locker Game UX

**Files:**
- Create `frontend/src/lib/catalog-games.ts`.
- Modify frontend catalog API wrapper.
- Modify catalog route/page components.
- Modify homepage category blocks.
- Modify header/category navigation.
- Modify tests for catalog filters and cards.

**Frontend Model:**

```ts
export const CATALOG_GAMES = ["cs2", "rust", "tf2"] as const;
export type CatalogGame = (typeof CATALOG_GAMES)[number];

export const CATALOG_GAME_LABELS: Record<CatalogGame, string> = {
  cs2: "CS2",
  rust: "Rust",
  tf2: "Team Fortress 2",
};
```

Routing:
- Use `/catalog?category=skins&game=cs2`.
- Use `/catalog?category=skins&game=rust`.
- Use `/catalog?category=skins&game=tf2`.
- Preserve sort/search while switching game tabs.

UI:
- Replace Dota/Rust seed-era nav with real game tabs only from API facets or static game model gated by backend availability.
- Do not show product count badges when data is sparse or still loading.
- Do not show generic image blocks saying `CS2 / Steam item`.
- Product cards require API image URL. If image is absent, the API should not publish the product; the frontend may render a broken-image-safe collapsed state for defensive UX, but not a fake catalog card.
- Product descriptions must come from API; do not synthesize generic text in JSX.
- All UI chrome remains Russian.
- Price remains `Coins`.

**Tests:**

Add/adjust frontend tests proving:
- Game tabs render CS2, Rust, Team Fortress 2.
- Dota 2 is not rendered.
- Clicking game tab updates URL query.
- Product card uses API image and description.
- Missing image does not produce the old generic `CS2 / Steam item` placeholder.
- Search and sort survive game tab switching.

**Acceptance Commands:**

```bash
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Task 7: Verify Checkout And Fulfillment Across All Games

**Files:**
- Modify backend checkout/order tests.
- Modify SIH fulfillment tests.
- Modify inventory/history DTO tests if game labels are customer-visible there.

**Implementation:**

Audit existing purchase flow and ensure every order line carries canonical game key through:

```text
catalog_products.game
cart line
checkout order line
fulfillment attempt
SIH create order app id
trade/inventory/history record
```

SIH app ids:
- `cs2` -> `730`
- `rust` -> `252490`
- `tf2` -> `440`

Rules:
- Steam identity is required for all game-item purchases.
- Steam Trade URL is required for all game-item purchases.
- Trade URL may belong to another Steam account if product policy allows gifting. The checkout must not silently assume it must match the logged-in Steam ID unless SIH rejects that use case. If SIH requires account match, the UI must say that before payment.
- `sell-to-site` remains disabled unless explicitly re-enabled.

**Tests:**

Add tests proving:
- CS2 checkout still works.
- Rust checkout builds SIH payload with app id `252490`.
- TF2 checkout builds SIH payload with app id `440`.
- Missing Trade URL blocks checkout before payment.
- Invalid game cannot enter checkout.
- History displays the correct game label.

**Acceptance Commands:**

```bash
npm --prefix backend test -- checkout
npm --prefix backend test -- fulfillment
npm --prefix backend run test:integration -- commerce
```

## Task 8: Add Operations, Acceptance, And Rollout Procedure

**Files:**
- Modify `backend/package.json`.
- Modify `docs/development/agent-workflow.md`.
- Modify `docs/architecture/project-architecture.md`.
- Add or update provider acceptance docs.

**Backend Scripts:**

Add:

```json
"catalog:sync-metadata": "tsx src/catalog-sync-metadata.ts",
"catalog:publish": "tsx src/catalog-publish.ts",
"catalog:sync-all-games": "tsx src/catalog-sync-all-games.ts"
```

`catalog:sync-all-games` must:
1. Read `CATALOG_PUBLIC_GAMES`.
2. For each enabled game, run SIH supplier sync.
3. For each enabled game, run metadata sync.
4. Run publication.
5. Print nonsecret evidence:
   - game key
   - SIH active listing count
   - metadata item count
   - published product count
   - latest sync run ids
   - provider request ids where available

Do not print:
- SIH API key
- Arc Pay keys
- webhook secrets
- Steam session cookies

**Production Rollout:**

Before enabling Rust/TF2 on production:

```bash
npm --prefix backend run acceptance:readiness
SIH_API_KEY_FILE=/absolute/restricted/sih-key npm --prefix backend run acceptance:sih-catalog -- --game=cs2
SIH_API_KEY_FILE=/absolute/restricted/sih-key npm --prefix backend run acceptance:sih-catalog -- --game=rust
SIH_API_KEY_FILE=/absolute/restricted/sih-key npm --prefix backend run acceptance:sih-catalog -- --game=tf2
```

Then run production sync:

```bash
CATALOG_PUBLIC_GAMES=cs2,rust,tf2 npm --prefix backend run catalog:sync-all-games
```

Production database checks:

```sql
select supplier_provider, kind, game, count(*) as total,
       count(*) filter (where public_enabled) as public
from catalog_products
group by supplier_provider, kind, game
order by kind, game, supplier_provider;

select game, count(*) as active_listings
from supplier_listings
where supplier_provider = 'sih' and active
group by game
order by game;

select provider, game, locale, count(*) as metadata_items
from catalog_metadata_items
group by provider, game, locale
order by game, provider, locale;
```

Browser QA:
- Home page has no Dota 2 or GPT refill entry.
- Catalog skin tabs show CS2, Rust, Team Fortress 2.
- Each game page loads real SIH-backed products.
- Product cards have real images, descriptions, and Coin prices.
- Search works inside each game.
- Sort by price ascending/descending works.
- Cart/checkout blocks game-item purchase without Steam login and Trade URL.
- Test-mode checkout for a low-cost item completes through Arc Pay and creates database proof.

**Full Verification Gate:**

```bash
npm --prefix backend run verify
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Execution Order

- [x] Task 1: Add durable catalog game model.
- [x] Task 2: Add metadata persistence.
- [x] Task 3: Port metadata providers.
- [x] Task 4: Replace CS2-only promotion with generic publication.
- [x] Task 5: Extend catalog API contract.
- [x] Task 6: Update frontend catalog UX.
- [x] Task 7: Verify checkout and fulfillment across all games.
- [x] Task 8: Add operations, acceptance, and rollout procedure.

## Explicit Non-Goals For This Plan

- GPT refill.
- Dota 2.
- Sell-to-site.
- Automatic machine translation for Rust/TF2 metadata.
- Replacing Arc Pay.
- Changing internal Coin economics.
- Changing SIH provider for item fulfillment.

## Expected End State

- Vault public catalog can show the same game set as Locker: CS2, Rust, and Team Fortress 2.
- SIH supplier listings exist for all enabled public games.
- Metadata-backed publication removes generic cards, fake descriptions, and missing images.
- Frontend routes and filters match the multi-game model.
- Checkout and fulfillment preserve game identity through SIH app id.
- Production rollout has database proof for supplier listings, metadata coverage, and published counts per game.
