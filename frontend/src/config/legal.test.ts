import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { legalDocuments } from "./legal.ts";

function documentText(id: "privacy" | "terms") {
  const document = legalDocuments.find((item) => item.id === id);
  assert.ok(document);
  return [
    document.title,
    document.summary,
    ...document.intro,
    ...document.sections.flatMap((section) => [
      section.title,
      ...section.blocks.flatMap((block) => block.type === "paragraph" ? [block.text] : block.items),
    ]),
  ].join("\n");
}

test("юридический раздел содержит только политику и пользовательское соглашение", () => {
  assert.deepEqual(legalDocuments.map((document) => document.id), [
    "privacy",
    "terms",
  ]);
  assert.ok(legalDocuments.every((document) => !/(refund|provably)/i.test(document.id)));
});

test("политика и соглашение содержат полный согласованный текст", () => {
  const privacy = documentText("privacy");
  const terms = documentText("terms");

  assert.match(privacy, /ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ И ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ/);
  assert.match(privacy, /1\. Сведения об Операторе/);
  assert.match(privacy, /SECURE KEYS - FZCO/);
  assert.match(privacy, /Регистрационный номер:\s*52124/);
  assert.match(privacy, /Dubai Silicon Oasis/);

  assert.match(terms, /ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ/);
  assert.match(terms, /1\. ОПРЕДЕЛЕНИЯ/);
  assert.match(terms, /9\. ОШИБКИ/);
  assert.doesNotMatch(terms, /ВОЗВРАТ СРЕДСТВ|Отлично, завершаем документ\.|Provably Fair/);
});

test("маршруты и названия юридических документов уникальны", () => {
  assert.equal(new Set(legalDocuments.map((document) => document.href)).size, legalDocuments.length);
  assert.equal(new Set(legalDocuments.map((document) => document.title)).size, legalDocuments.length);
});

test("футер использует реквизиты компании и не публикует удалённые документы", () => {
  const footer = readFileSync("src/components/layout/SiteFooter.tsx", "utf8");
  assert.match(footer, /siteConfig\.company\.legalName/);
  assert.match(footer, /siteConfig\.company\.registrationNumber/);
  assert.match(footer, /siteConfig\.company\.legalAddress/);
  assert.doesNotMatch(footer, /legal\/(refund|provably-fair)|Политика возвратов|Provably Fair/);
});
