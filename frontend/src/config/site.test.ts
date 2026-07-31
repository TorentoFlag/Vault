import assert from "node:assert/strict";
import test from "node:test";

import { publicAssetPath } from "./site.ts";

test("public asset path preserves external provider image URLs", () => {
  const external = "https://steaminventoryhelper.com/cdn-cgi/imagedelivery/example/public";
  assert.equal(publicAssetPath(external), external);
});

test("public asset path keeps local assets root-relative without a base path", () => {
  assert.equal(publicAssetPath("/products/ak-redline.png"), "/products/ak-redline.png");
});
