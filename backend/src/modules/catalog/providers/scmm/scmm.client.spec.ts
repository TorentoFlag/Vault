import { afterEach, describe, expect, it, vi } from "vitest";

import { ScmmClient } from "./scmm.client";

describe("ScmmClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches Rust SCMM pages and returns only requested market hashes", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      start: "0",
      count: "1",
      total: "1",
      items: [{
        appId: "252490",
        id: "123",
        nameHash: "Metal Facemask",
        name: "Metal Facemask",
        itemType: "Mask",
        iconUrl: "https://cdn.example/rust/metal-facemask.png",
        tags: { scmmcat: "Armor" },
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }))));

    const result = await new ScmmClient({
      maximumBodyBytesPerPage: 10_000,
      pageConcurrency: 1,
      pageSize: 1,
      requestTimeoutMs: 1_000,
    }).fetch({
      game: "rust",
      locale: "en",
      marketHashNames: ["Metal Facemask"],
    });

    expect(result.items.map((item) => item.marketHashName)).toEqual(["Metal Facemask"]);
    expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
