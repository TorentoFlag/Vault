# Catalog Sync Runbook

Vault first-release game catalog scope is `cs2`, `rust`, and `tf2`. GPT refill and Dota 2 are not part of the public first release.

The public skin catalog is built from two independent data sources:

- SIH supplier listings: current availability and supplier price.
- Game metadata: public title, description, image, category/type, tags, and publication eligibility.

Do not publish a skin from SIH supplier data alone. A SIH listing becomes public only when:

- its game is listed in `CATALOG_PUBLIC_GAMES`;
- it has an active SIH listing with positive quantity and price;
- matching metadata exists for the same `(provider, game, locale, market_hash_name)`;
- metadata includes a trusted image URL and non-empty description.

## Production Sync Order

Run from the repository root on the backend host with production environment loaded.

Recommended full sync:

```sh
SIH_API_KEY_FILE=/absolute/restricted/sih-key CATALOG_PUBLIC_GAMES=cs2,rust,tf2 npm --prefix backend run catalog:sync-all-games
```

Manual per-game sync:

```sh
SIH_API_KEY_FILE=/absolute/restricted/sih-key CATALOG_PUBLIC_GAMES=cs2,rust,tf2 npm --prefix backend run catalog:sync-sih -- --game=cs2
SIH_API_KEY_FILE=/absolute/restricted/sih-key CATALOG_PUBLIC_GAMES=cs2,rust,tf2 npm --prefix backend run catalog:sync-sih -- --game=rust
SIH_API_KEY_FILE=/absolute/restricted/sih-key CATALOG_PUBLIC_GAMES=cs2,rust,tf2 npm --prefix backend run catalog:sync-sih -- --game=tf2

CATALOG_PUBLIC_GAMES=cs2,rust,tf2 npm --prefix backend run catalog:sync-metadata -- --game=cs2
CATALOG_PUBLIC_GAMES=cs2,rust,tf2 npm --prefix backend run catalog:sync-metadata -- --game=rust
CATALOG_PUBLIC_GAMES=cs2,rust,tf2 npm --prefix backend run catalog:sync-metadata -- --game=tf2
```

Expected output is JSON with nonsecret counts: active SIH listings, metadata item count, promoted product count, provider, source hash, and snapshot id.

## Diagnostics

If the frontend shows too few skins, check these counts in PostgreSQL:

```sql
SELECT game, count(*) AS active_listings
FROM supplier_listings
WHERE supplier = 'sih' AND active = true AND available_quantity > 0 AND price_microusd > 0
GROUP BY game
ORDER BY game;

SELECT game, provider, locale, count(*) AS metadata_items
FROM catalog_metadata_items
GROUP BY game, provider, locale
ORDER BY game;

SELECT lower(game) AS game, count(*) AS public_products
FROM catalog_products
WHERE supplier_provider = 'sih' AND kind = 'skins' AND public_enabled = true
GROUP BY lower(game)
ORDER BY game;
```

If active listings are high but public products are low, metadata coverage is missing or blocked by image/description policy.

## Legacy Script

`catalog:sync-cs2-images` is a legacy CS2-only compatibility script. New production catalog sync should use `catalog:sync-sih` and `catalog:sync-metadata` for each public game.
