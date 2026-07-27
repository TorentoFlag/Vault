import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiProblemError,
  apiPaths,
  buildApiUrl,
  createApiClient,
  isApiUser,
} from "./api.ts";

test("frontend API transport is constrained to backend OpenAPI paths", () => {
  assert.deepEqual(apiPaths, [
    "/session/me",
    "/session/csrf",
    "/session/logout",
    "/me/steam-trade-url",
    "/me/steam-trade-url/status",
  ]);
});

test("buildApiUrl keeps API calls same-origin by default and accepts configured origins", () => {
  assert.equal(buildApiUrl("/session/me").toString(), "http://localhost/session/me");
  assert.equal(
    buildApiUrl("/session/me", "https://api.vault.example/base").toString(),
    "https://api.vault.example/session/me",
  );
});

test("API client sends credentials and CSRF for state-changing requests", async () => {
  const calls: RequestInit[] = [];
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    csrfToken: () => "csrf-token",
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({ configured: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await client.putSteamTradeUrl("https://steamcommunity.com/tradeoffer/new/?partner=1&token=a");
  assert.deepEqual(result, { configured: true });
  assert.equal(calls[0]?.credentials, "include");
  assert.equal((calls[0]?.headers as Record<string, string>)["x-csrf-token"], "csrf-token");
});

test("API client raises Problem errors without leaking response parsing details", async () => {
  const client = createApiClient({
    fetch: async () => new Response(JSON.stringify({
      code: "UNAUTHORIZED",
      detail: "Sign in with Steam.",
      status: 401,
      title: "Unauthorized",
      type: "https://vault.local/problems/unauthorized",
      requestId: "req_1",
    }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  });

  await assert.rejects(
    () => client.getCurrentUser(),
    (error) => error instanceof ApiProblemError && error.problem.code === "UNAUTHORIZED",
  );
});

test("isApiUser accepts backend Steam identity and rejects leaked Trade URL payloads", () => {
  assert.equal(isApiUser({
    id: "user_76561198000000001",
    steam: { connected: true, steamId64: "76561198000000001" },
  }), true);
  assert.equal(isApiUser({
    id: "user_76561198000000001",
    steam: { connected: true, steamId64: "76561198000000001" },
    tradeCredential: { token: "secret" },
  }), false);
});
