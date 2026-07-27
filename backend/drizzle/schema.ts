import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
