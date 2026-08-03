import assert from "node:assert/strict";
import test from "node:test";

import { publicAssetPath, siteConfig } from "./site.ts";

test("public asset path preserves external provider image URLs", () => {
  const external = "https://steaminventoryhelper.com/cdn-cgi/imagedelivery/example/public";
  assert.equal(publicAssetPath(external), external);
});

test("public asset path keeps local assets root-relative without a base path", () => {
  assert.equal(publicAssetPath("/products/ak-redline.png"), "/products/ak-redline.png");
});

test("public site config exposes the confirmed company identity", () => {
  assert.equal(siteConfig.company.legalName, "SECURE KEYS - FZCO");
  assert.equal(siteConfig.company.registrationNumber, "52124");
  assert.match(siteConfig.company.legalAddress, /Dubai Silicon Oasis/);
  assert.match(siteConfig.company.legalAddress, /IFZA Business Park/);
  assert.equal(siteConfig.company.supportEmail, "support@vaultapp24.com");
});
