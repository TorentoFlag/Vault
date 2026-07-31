import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_GAMES,
  getCatalogGameLabel,
  isCatalogGame,
  parseCatalogGame,
} from "./catalog-games.ts";

test("catalog games match Locker release scope", () => {
  assert.deepEqual(CATALOG_GAMES, ["cs2", "rust", "tf2"]);
  assert.equal(getCatalogGameLabel("cs2"), "CS2");
  assert.equal(getCatalogGameLabel("rust"), "Rust");
  assert.equal(getCatalogGameLabel("tf2"), "Team Fortress 2");
  assert.equal(isCatalogGame("dota2"), false);
  assert.equal(parseCatalogGame("CS2"), "cs2");
});
