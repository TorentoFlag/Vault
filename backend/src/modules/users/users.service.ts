import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";

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

  upsertSteamUser(identity: VerifiedSteamIdentity): CustomerUser {
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

  requireUser(userId: string): CustomerUser {
    const user = this.usersById.get(userId);
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  saveSteamTradeCredential(userId: string, credential: SteamTradeCredential): void {
    this.requireUser(userId);
    this.steamTradeCredentialsByUserId.set(userId, encryptCredential(credential));
  }

  hasSteamTradeCredential(userId: string): boolean {
    this.requireUser(userId);
    return this.steamTradeCredentialsByUserId.has(userId);
  }

  requireSteamTradeCredential(userId: string): SteamTradeCredential {
    this.requireUser(userId);
    const envelope = this.steamTradeCredentialsByUserId.get(userId);
    if (!envelope) throw new NotFoundException("Steam Trade URL is not configured");
    return decryptCredential(envelope);
  }
}
