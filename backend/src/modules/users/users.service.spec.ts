import { describe, expect, it } from "vitest";

import { UsersService } from "./users.service";

describe("UsersService", () => {
  it("keeps Steam Trade URL credentials out of public user records", () => {
    const users = new UsersService();
    const user = users.upsertSteamUser({
      claimedIdentifier: "https://steamcommunity.com/openid/id/76561198000000001",
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-27T10:00:00Znonce",
      steamId64: "76561198000000001",
    });

    users.saveSteamTradeCredential(user.id, { partner: "39734273", token: "secretToken" });

    expect(JSON.stringify(users.requireUser(user.id))).not.toContain("secretToken");
    expect(users.requireSteamTradeCredential(user.id)).toEqual({
      partner: "39734273",
      token: "secretToken",
    });
  });
});
