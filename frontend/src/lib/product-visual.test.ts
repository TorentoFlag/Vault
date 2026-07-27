import assert from "node:assert/strict";
import test from "node:test";

import { getProductVisualLabel } from "./product-visual.ts";

test("uses the game name for image-free skin products", () => {
  assert.equal(getProductVisualLabel({ kind: "skins", game: "Dota 2" }), "Dota 2");
  assert.equal(getProductVisualLabel({ kind: "skins", game: "Rust" }), "Rust");
});

test("keeps service labels for Steam and GPT products", () => {
  assert.equal(getProductVisualLabel({ kind: "steam", game: undefined }), "STEAM");
  assert.equal(getProductVisualLabel({ kind: "gpt", game: undefined }), "GPT");
});
