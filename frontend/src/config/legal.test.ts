import assert from "node:assert/strict";
import test from "node:test";

import { legalDocuments } from "./legal.ts";

test("юридический раздел содержит все четыре обязательных документа", () => {
  assert.deepEqual(legalDocuments.map((document) => document.id), [
    "privacy",
    "terms",
    "refund",
    "provably-fair",
  ]);
});

test("маршруты и названия юридических документов уникальны", () => {
  assert.equal(new Set(legalDocuments.map((document) => document.href)).size, legalDocuments.length);
  assert.equal(new Set(legalDocuments.map((document) => document.title)).size, legalDocuments.length);
});
