import assert from "node:assert/strict";
import test from "node:test";

import { getProductVisualLabel } from "./product-visual.ts";

test("does not create image-free artwork labels for skin products", () => {
  assert.equal(getProductVisualLabel({ kind: "skins", game: "rust" }), null);
});

test("keeps service labels for Steam and GPT products", () => {
  assert.equal(getProductVisualLabel({ kind: "steam", game: undefined }), "STEAM");
  assert.equal(getProductVisualLabel({ kind: "gpt", game: undefined }), "GPT");
});
