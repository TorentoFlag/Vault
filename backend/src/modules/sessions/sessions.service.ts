import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";

import {
  createCsrfToken,
  createOpaqueToken,
  digestToken,
  verifyCsrfToken,
} from "./session-cookies";

export type CurrentCustomer = {
  sessionId: string;
  userId: string;
};

export type CreatedSession = {
  token: string;
  maximumAgeSeconds: number;
};

type StoredSession = {
  id: string;
  userId: string;
  tokenDigest: string;
  expiresAt: number;
  revokedAt: number | null;
};

@Injectable()
export class SessionsService {
  private readonly sessionsByDigest = new Map<string, StoredSession>();
  private readonly csrfSecret = createHash("sha256")
    .update(process.env.COOKIE_HMAC_SECRET ?? "vault-development-cookie-secret", "utf8")
    .digest();
  private readonly maximumAgeSeconds = 60 * 60 * 24 * 30;

  createSession(userId: string, presentedToken: string | null): CreatedSession {
    if (presentedToken) this.revoke(presentedToken);
    const token = createOpaqueToken();
    const session: StoredSession = {
      id: `session_${createOpaqueToken()}`,
      userId,
      tokenDigest: digestToken(token),
      expiresAt: Date.now() + this.maximumAgeSeconds * 1_000,
      revokedAt: null,
    };
    this.sessionsByDigest.set(session.tokenDigest, session);
    return { token, maximumAgeSeconds: this.maximumAgeSeconds };
  }

  authenticate(token: string): CurrentCustomer | null {
    const session = this.sessionsByDigest.get(digestToken(token));
    if (!session || session.revokedAt !== null || session.expiresAt <= Date.now()) return null;
    return { sessionId: session.id, userId: session.userId };
  }

  revoke(token: string): void {
    const session = this.sessionsByDigest.get(digestToken(token));
    if (session) this.sessionsByDigest.set(session.tokenDigest, { ...session, revokedAt: Date.now() });
  }

  createCsrfToken(sessionToken: string): string {
    return createCsrfToken(sessionToken, this.csrfSecret);
  }

  verifyCsrfToken(sessionToken: string, csrfToken: string): boolean {
    return verifyCsrfToken(sessionToken, csrfToken, this.csrfSecret);
  }
}
