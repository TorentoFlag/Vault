import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVvAdminManifestUrl,
  fetchVvAdminManifest,
} from "./vv-admin-manifest.ts";

test("VV Admin manifest route targets the server-side backend origin", () => {
  assert.equal(
    buildVvAdminManifestUrl({
      VAULT_API_BASE_URL: "http://backend:3000",
      NEXT_PUBLIC_API_BASE_URL: "https://vaultapp24.com",
    }).toString(),
    "http://backend:3000/.well-known/vv-admin/manifest.json",
  );
});

test("VV Admin manifest fetch preserves the upstream response", async () => {
  const requestedUrls: string[] = [];
  const upstreamResponse = new Response(JSON.stringify({ site: { key: "vault" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const response = await fetchVvAdminManifest({
    env: { VAULT_API_BASE_URL: "https://api.vault.example/base" },
    fetch: async (input) => {
      requestedUrls.push(input.toString());
      return upstreamResponse;
    },
  });

  assert.equal(response, upstreamResponse);
  assert.deepEqual(requestedUrls, ["https://api.vault.example/.well-known/vv-admin/manifest.json"]);
});
