import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync(
  new URL("../features/home/ProductCollection.tsx", import.meta.url),
  "utf8",
);
const stylesSource = readFileSync(
  new URL("../features/home/home.module.css", import.meta.url),
  "utf8",
);

test("карточка перехода в каталог не содержит иконку-сетку", () => {
  assert.doesNotMatch(componentSource, /catalogCtaIcon|name="grid"/);
});

test("содержимое карточки перехода выровнено по центру", () => {
  assert.match(
    stylesSource,
    /\.catalogCtaCard > a\s*{[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?text-align:\s*center;[\s\S]*?}/,
  );
});

test("фон карточки перехода использует мягкое центральное свечение", () => {
  assert.match(
    stylesSource,
    /\.catalogCtaCard::before\s*{[\s\S]*?inset:\s*0;[\s\S]*?radial-gradient\(circle at 50% 45%,\s*rgb\(104 120 158 \/ 0\.2\),\s*transparent 60%\);[\s\S]*?}/,
  );
});

test("у карточки перехода нет синей полоски сверху", () => {
  const pseudoElement = stylesSource.match(/\.catalogCtaCard::before\s*{([\s\S]*?)}/)?.[1] ?? "";

  assert.doesNotMatch(pseudoElement, /height:\s*3px;/);
  assert.doesNotMatch(pseudoElement, /background:\s*var\(--accent\);/);
});
