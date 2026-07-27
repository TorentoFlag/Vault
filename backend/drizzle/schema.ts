import { bigint as pgBigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    steamId64: text("steam_id64").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    disabled: boolean("disabled").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_steam_id64_uidx").on(table.steamId64),
    index("users_disabled_idx").on(table.disabled),
  ],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    tokenDigest: text("token_digest").notNull(),
    rotatedFromSessionId: uuid("rotated_from_session_id"),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_sessions_token_digest_uidx").on(table.tokenDigest),
    index("user_sessions_user_active_idx").on(table.userId, table.revokedAt),
    index("user_sessions_cleanup_idx").on(table.absoluteExpiresAt),
  ],
);

export const steamAuthAttempts = pgTable(
  "steam_auth_attempts",
  {
    stateDigest: text("state_digest").primaryKey(),
    browserTokenDigest: text("browser_token_digest").notNull(),
    returnTo: text("return_to").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("steam_auth_attempts_expiry_idx").on(table.expiresAt)],
);

export const steamOpenIdAssertions = pgTable(
  "steam_openid_assertions",
  {
    responseNonce: text("response_nonce").primaryKey(),
    steamId64: text("steam_id64").notNull(),
    claimedIdentifier: text("claimed_identifier").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("steam_openid_assertions_steam_idx").on(table.steamId64)],
);

export const steamTradeCredentials = pgTable("steam_trade_credentials", {
  userId: text("user_id").primaryKey(),
  partnerAccountId: text("partner_account_id").notNull(),
  keyVersion: text("key_version").notNull(),
  cipherVersion: text("cipher_version").notNull(),
  ciphertext: text("ciphertext").notNull(),
  nonce: text("nonce").notNull(),
  authTag: text("auth_tag").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    requestId: text("request_id"),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_actor_idx").on(table.actorUserId, table.createdAt),
    index("audit_events_target_idx").on(table.targetType, table.targetId, table.createdAt),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: text("id").notNull(),
    scope: text("scope").notNull(),
    requestHash: text("request_hash").notNull(),
    responseHash: text("response_hash"),
    status: text("status").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.id] }),
    index("idempotency_keys_status_idx").on(table.status),
  ],
);

export const catalogProducts = pgTable(
  "catalog_products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    kind: text("kind").notNull(),
    category: text("category").notNull(),
    game: text("game"),
    productType: text("product_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priceCoinMinor: integer("price_coin_minor").notNull(),
    availability: text("availability").notNull(),
    fulfillmentMode: text("fulfillment_mode").notNull(),
    popularity: integer("popularity").notNull(),
    image: text("image"),
    imageAlt: text("image_alt"),
    meta: text("meta").array().notNull(),
    keywords: text("keywords").array().notNull(),
    details: jsonb("details").notNull(),
    supplierProvider: text("supplier_provider"),
    supplierItemId: text("supplier_item_id"),
    supplierSnapshot: jsonb("supplier_snapshot").default({}).notNull(),
    supplierFreshAt: timestamp("supplier_fresh_at", { withTimezone: true }),
    publicEnabled: boolean("public_enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("catalog_products_slug_uidx").on(table.slug),
    index("catalog_products_kind_public_idx").on(table.kind, table.publicEnabled),
    index("catalog_products_game_idx").on(table.game),
    index("catalog_products_product_type_idx").on(table.productType),
  ],
);

export const catalogSyncRuns = pgTable(
  "catalog_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull(),
    game: text("game").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    rowCount: integer("row_count").default(0).notNull(),
    errorCode: text("error_code"),
    metadata: jsonb("metadata").default({}).notNull(),
  },
  (table) => [
    index("catalog_sync_runs_source_game_idx").on(table.source, table.game, table.startedAt),
    index("catalog_sync_runs_status_idx").on(table.status),
  ],
);

export const supplierListings = pgTable(
  "supplier_listings",
  {
    supplier: text("supplier").notNull(),
    game: text("game").notNull(),
    marketHashName: text("market_hash_name").notNull(),
    active: boolean("active").default(true).notNull(),
    availableQuantity: integer("available_quantity").notNull(),
    priceMicrousd: pgBigint("price_microusd", { mode: "bigint" }).notNull(),
    imageUrl: text("image_url"),
    snapshot: jsonb("snapshot").default({}).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSyncRunId: uuid("last_sync_run_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.supplier, table.game, table.marketHashName] }),
    index("supplier_listings_active_idx").on(table.supplier, table.game, table.active),
    index("supplier_listings_last_seen_idx").on(table.lastSeenAt),
  ],
);
