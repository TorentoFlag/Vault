import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_FEED_BATCH_SIZE,
  createCatalogFeedEntries,
  getNextCatalogFeedSize,
} from "./catalog-feed.ts";

const products = [
  { id: "ak" },
  { id: "awp" },
  { id: "steam" },
];

test("catalog feed opens with two four-column rows", () => {
  assert.equal(CATALOG_FEED_BATCH_SIZE, 8);
  assert.equal(getNextCatalogFeedSize(0), 8);
  assert.equal(getNextCatalogFeedSize(8), 16);
});

test("catalog feed shows each matching product once and stops at the end", () => {
  const entries = createCatalogFeedEntries(products, 8);

  assert.deepEqual(entries.map((entry) => entry.item.id), ["ak", "awp", "steam"]);
  assert.deepEqual(entries.map((entry) => entry.key), ["ak", "awp", "steam"]);
  assert.equal(getNextCatalogFeedSize(8, products.length), products.length);
});

test("catalog feed handles empty inventory and invalid window sizes safely", () => {
  assert.deepEqual(createCatalogFeedEntries([], 8), []);
  assert.deepEqual(createCatalogFeedEntries(products, 0), []);
  assert.deepEqual(createCatalogFeedEntries(products, -10), []);
});
