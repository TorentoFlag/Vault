# VV Admin integration

Vault exposes the unified VV Admin integration contract from the backend. The
public storefront origin also serves the manifest path and proxies it to the
backend, because VV Admin discovers manifests from the registered public domain.
The contract is intentionally narrow: VV Admin monitors the storefront and
manages only Apple gift-card catalog records. CS2, Rust, and Team Fortress 2
skins remain provider-fed catalog resources owned by Vault sync jobs.

## Manifest

`GET /.well-known/vv-admin/manifest.json` publishes:

- site identity: `vault`;
- commerce webhook delivery metadata;
- operational health checks for backend, frontend, Postgres, Redis, Arc Pay
  top-up, checkout/fulfillment readiness, supplier quote storage, Steam refill,
  visible catalog, per-game skin catalog, and Apple gift cards;
- synthetic scenario `checkout_payment_reached`, which creates a tiny synthetic
  Arc Pay top-up, verifies that a hosted payment URL is returned, and expires the
  synthetic top-up immediately;
- Catalog Protocol capability at `/admin/integration/catalog`.

The manifest does not publish protocol-number branches or legacy adapters.

## Catalog Protocol

Catalog Protocol requests are signed with VV Admin HMAC headers. The backend
expects `VV_ADMIN_INTEGRATION_SECRET_FILE`; when it is absent, it falls back to
`VV_ADMIN_WEBHOOK_SECRET_FILE`. The expected site key is
`VV_ADMIN_SITE_KEY`, falling back to `vault`.

Supported resources:

- categories: one fixed category, `apple_gift_card`;
- products: only `catalog_products.kind = 'apple_gift_card'`;
- offers: one offer per Apple gift-card product, priced in Coins;
- sellers, destinations, and collections: disabled and returned as empty lists.

Deleting an Apple gift-card product is blocked while `order_lines.product_id`
references it. Offer deletion disables public availability instead of removing
the product record.

## Health endpoints

The manifest points VV Admin to backend-owned checks under
`/admin/integration/health/*`. These endpoints report the real runtime state and
return HTTP 503 when a dependency is not usable. They must not be faked during
deploys or incident handling.
