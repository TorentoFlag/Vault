import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import type { VerifiedSteamIdentity } from "./steam-identity";
import type { SteamTradeCredential } from "./steam-trade-url";

export type CustomerUser = {
  id: string;
  steam: {
    connected: true;
    steamId64: string;
  };
};

type EncryptedSteamTradeCredential = {
  partner: string;
  ciphertext: string;
  nonce: string;
  authTag: string;
};

function encryptionKey(): Buffer {
  return createHash("sha256")
    .update(process.env.DATA_ENCRYPTION_SECRET ?? "vault-development-data-secret", "utf8")
    .digest();
}

function encryptCredential(credential: SteamTradeCredential): EncryptedSteamTradeCredential {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credential), "utf8"),
    cipher.final(),
  ]);
  return {
    partner: credential.partner,
    ciphertext: ciphertext.toString("base64url"),
    nonce: nonce.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

function decryptCredential(envelope: EncryptedSteamTradeCredential): SteamTradeCredential {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]);
  const parsed = JSON.parse(plaintext.toString("utf8")) as SteamTradeCredential;
  if (parsed.partner !== envelope.partner) throw new Error("Stored Steam trade credential is malformed");
  return parsed;
}

@Injectable()
export class UsersService {
  private readonly usersById = new Map<string, CustomerUser>();
  private readonly idsBySteamId64 = new Map<string, string>();
  private readonly steamTradeCredentialsByUserId = new Map<string, EncryptedSteamTradeCredential>();

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async upsertSteamUser(identity: VerifiedSteamIdentity): Promise<CustomerUser> {
    if (this.database.isConfigured()) {
      const userId = `user_${identity.steamId64}`;
      const result = await this.database.query<{ id: string; steam_id64: string }>(
        `
          INSERT INTO users (id, steam_id64)
          VALUES ($1, $2)
          ON CONFLICT (steam_id64) DO UPDATE
          SET updated_at = clock_timestamp()
          RETURNING id, steam_id64
        `,
        [userId, identity.steamId64],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Steam user was not stored");
      return {
        id: row.id,
        steam: {
          connected: true,
          steamId64: row.steam_id64,
        },
      };
    }

    const userId = this.idsBySteamId64.get(identity.steamId64) ?? `user_${identity.steamId64}`;
    const existing = this.usersById.get(userId);
    const next: CustomerUser = {
      ...existing,
      id: userId,
      steam: {
        connected: true,
        steamId64: identity.steamId64,
      },
    };
    this.usersById.set(userId, next);
    this.idsBySteamId64.set(identity.steamId64, userId);
    return next;
  }

  async requireUser(userId: string): Promise<CustomerUser> {
    if (this.database.isConfigured()) {
      const result = await this.database.query<{ id: string; steam_id64: string }>(
        "SELECT id, steam_id64 FROM users WHERE id = $1 AND disabled = false LIMIT 1",
        [userId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException("User not found");
      return {
        id: row.id,
        steam: {
          connected: true,
          steamId64: row.steam_id64,
        },
      };
    }

    const user = this.usersById.get(userId);
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async saveSteamTradeCredential(userId: string, credential: SteamTradeCredential): Promise<void> {
    await this.requireUser(userId);
    const encrypted = encryptCredential(credential);
    if (this.database.isConfigured()) {
      await this.database.query(
        `
          INSERT INTO steam_trade_credentials (
            user_id,
            partner_account_id,
            key_version,
            cipher_version,
            ciphertext,
            nonce,
            auth_tag
          )
          VALUES ($1, $2, 'v1', 'aes-256-gcm', $3, $4, $5)
          ON CONFLICT (user_id) DO UPDATE
          SET partner_account_id = EXCLUDED.partner_account_id,
              key_version = EXCLUDED.key_version,
              cipher_version = EXCLUDED.cipher_version,
              ciphertext = EXCLUDED.ciphertext,
              nonce = EXCLUDED.nonce,
              auth_tag = EXCLUDED.auth_tag,
              updated_at = clock_timestamp()
        `,
        [userId, encrypted.partner, encrypted.ciphertext, encrypted.nonce, encrypted.authTag],
      );
      return;
    }

    this.steamTradeCredentialsByUserId.set(userId, encrypted);
  }

  async hasSteamTradeCredential(userId: string): Promise<boolean> {
    await this.requireUser(userId);
    if (this.database.isConfigured()) {
      const result = await this.database.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM steam_trade_credentials WHERE user_id = $1) AS exists",
        [userId],
      );
      return result.rows[0]?.exists ?? false;
    }

    return this.steamTradeCredentialsByUserId.has(userId);
  }

  async requireSteamTradeCredential(userId: string): Promise<SteamTradeCredential> {
    await this.requireUser(userId);
    if (this.database.isConfigured()) {
      const result = await this.database.query<{
        partner_account_id: string;
        ciphertext: string;
        nonce: string;
        auth_tag: string;
      }>(
        `
          SELECT partner_account_id, ciphertext, nonce, auth_tag
          FROM steam_trade_credentials
          WHERE user_id = $1
          LIMIT 1
        `,
        [userId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException("Steam Trade URL is not configured");
      return decryptCredential({
        partner: row.partner_account_id,
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        authTag: row.auth_tag,
      });
    }

    const envelope = this.steamTradeCredentialsByUserId.get(userId);
    if (!envelope) throw new NotFoundException("Steam Trade URL is not configured");
    return decryptCredential(envelope);
  }
}
