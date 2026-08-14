WITH duplicate_public_apple_variants AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        upper(details -> 'appleGiftCard' ->> 'regionCode'),
        upper(details -> 'appleGiftCard' ->> 'currency'),
        details -> 'appleGiftCard' ->> 'nominalMinor'
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM catalog_products
  WHERE kind = 'apple_gift_card'
    AND public_enabled = true
    AND details ? 'appleGiftCard'
    AND coalesce(details -> 'appleGiftCard' ->> 'regionCode', '') <> ''
    AND coalesce(details -> 'appleGiftCard' ->> 'currency', '') <> ''
    AND coalesce(details -> 'appleGiftCard' ->> 'nominalMinor', '') <> ''
)
UPDATE catalog_products
SET public_enabled = false,
    updated_at = clock_timestamp()
FROM duplicate_public_apple_variants
WHERE catalog_products.id = duplicate_public_apple_variants.id
  AND duplicate_public_apple_variants.duplicate_rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_products_public_apple_variant_uidx"
ON "catalog_products" USING btree (
  upper(details -> 'appleGiftCard' ->> 'regionCode'),
  upper(details -> 'appleGiftCard' ->> 'currency'),
  (details -> 'appleGiftCard' ->> 'nominalMinor')
)
WHERE kind = 'apple_gift_card'
  AND public_enabled = true
  AND details ? 'appleGiftCard'
  AND coalesce(details -> 'appleGiftCard' ->> 'regionCode', '') <> ''
  AND coalesce(details -> 'appleGiftCard' ->> 'currency', '') <> ''
  AND coalesce(details -> 'appleGiftCard' ->> 'nominalMinor', '') <> '';
