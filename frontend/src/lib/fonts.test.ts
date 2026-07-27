import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const srcDirectory = fileURLToPath(new URL("../", import.meta.url));
const layoutSource = readFileSync(join(srcDirectory, "app/layout.tsx"), "utf8");
const stylesSource = readdirSync(srcDirectory, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".css"))
  .map((file) => readFileSync(join(srcDirectory, file), "utf8"))
  .join("\n");

test("Inter и Rajdhani подключены через next/font", () => {
  assert.match(layoutSource, /from "next\/font\/google"/);
  assert.match(layoutSource, /Inter\s*\(/);
  assert.match(layoutSource, /Rajdhani\s*\(/);
  assert.match(layoutSource, /inter\.variable/);
  assert.match(layoutSource, /rajdhani\.variable/);
});

test("стили используют переменные шрифтов next/font", () => {
  assert.match(stylesSource, /font-family:\s*var\(--font-inter\)/);
  assert.match(
    stylesSource,
    /font-family:\s*var\(--font-rajdhani\),\s*var\(--font-inter\)/,
  );
  assert.doesNotMatch(
    stylesSource,
    /font-family:\s*(?:Inter|Roboto|Rajdhani)\b/,
  );
});
