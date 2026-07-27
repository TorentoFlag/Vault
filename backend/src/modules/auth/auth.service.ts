import { randomBytes } from "node:crypto";
import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import { UsersService } from "../users/users.service";
import { SessionsService } from "../sessions/sessions.service";
import {
  createSteamAuthenticationUrl,
  parseOpenIdCallback,
  type ParsedOpenIdCallback,
} from "./steam-openid";
import { SteamOpenIdVerifier } from "./steam-openid-verifier";

export type SteamAuthAttempt = {
  authUrl: URL;
  browserToken: string;
  maximumAgeSeconds: number;
};

export type CompletedSteamAuth = {
  returnTo: string;
  sessionToken: string;
  sessionMaximumAgeSeconds: number;
};

type StoredAttempt = {
  browserToken: string;
  expiresAt: number;
  returnTo: string;
  consumedAt: number | null;
};

const SAFE_RETURN_PATHS = new Set(["/", "/cart", "/checkout", "/account", "/account/steam"]);

function sanitizeReturnTo(value: unknown): string {
  return typeof value === "string" && SAFE_RETURN_PATHS.has(value) ? value : "/account";
}

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, StoredAttempt>();
  private readonly attemptTtlSeconds = 300;

  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(SteamOpenIdVerifier) private readonly verifier: SteamOpenIdVerifier,
  ) {}

  beginSteam(returnToInput: unknown): SteamAuthAttempt {
    const state = randomBytes(32).toString("base64url");
    const browserToken = randomBytes(32).toString("base64url");
    const returnTo = sanitizeReturnTo(returnToInput);
    const baseUrl = new URL(process.env.PUBLIC_BASE_URL ?? "https://vault.local");
    const callbackUrl = new URL("/auth/steam/callback", baseUrl);
    callbackUrl.searchParams.set("state", state);

    this.attempts.set(state, {
      browserToken,
      expiresAt: Date.now() + this.attemptTtlSeconds * 1_000,
      returnTo,
      consumedAt: null,
    });

    return {
      authUrl: createSteamAuthenticationUrl(callbackUrl, baseUrl),
      browserToken,
      maximumAgeSeconds: this.attemptTtlSeconds,
    };
  }

  async completeSteam(rawQuery: string, browserToken: string | null, presentedSessionToken: string | null): Promise<CompletedSteamAuth> {
    if (browserToken === null) throw new UnauthorizedException("Invalid Steam Authentication");
    const state = new URLSearchParams(rawQuery).get("state");
    if (state === null) throw new BadRequestException("Invalid Steam Authentication");
    const attempt = this.attempts.get(state);
    if (!attempt || attempt.consumedAt !== null || attempt.expiresAt <= Date.now() || attempt.browserToken !== browserToken) {
      throw new UnauthorizedException("Invalid Steam Authentication");
    }

    const baseUrl = new URL(process.env.PUBLIC_BASE_URL ?? "https://vault.local");
    const expectedReturnTo = new URL("/auth/steam/callback", baseUrl);
    expectedReturnTo.searchParams.set("state", state);
    const parsed = parseOpenIdCallback({
      expectedReturnTo,
      futureSkewSeconds: 60,
      maximumNonceAgeSeconds: 300,
      now: process.env.STEAM_OPENID_TEST_NOW ? new Date(process.env.STEAM_OPENID_TEST_NOW) : new Date(),
      rawQuery,
    });
    await this.verifySteam(parsed);

    this.attempts.set(state, { ...attempt, consumedAt: Date.now() });
    const user = this.users.upsertSteamUser(parsed.identity);
    const session = this.sessions.createSession(user.id, presentedSessionToken);

    return {
      returnTo: attempt.returnTo,
      sessionToken: session.token,
      sessionMaximumAgeSeconds: session.maximumAgeSeconds,
    };
  }

  private async verifySteam(parsed: ParsedOpenIdCallback): Promise<void> {
    if (!(await this.verifier.verify(parsed.openIdFields))) {
      throw new UnauthorizedException("Invalid Steam Authentication");
    }
  }
}
