import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sourceRoot = join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts")) return [];

    return [path];
  });
}

const forbiddenStorefrontPatterns = [
  /демо/giu,
  /тестов/giu,
  /имитир/giu,
  /backend/giu,
  /временно/giu,
  /ожида(?:ет|ют) юридического согласования/giu,
  /реальн(?:ый|ые|ая|ое) (?:платёж|платежи|списание|списания|покупка|покупки)[^.]*не/giu,
];

test("storefront copy avoids demo labels and technical placeholders", () => {
  const violations = sourceFiles(sourceRoot).flatMap((file) => {
    const source = readFileSync(file, "utf8");

    return forbiddenStorefrontPatterns.flatMap((pattern) => {
      pattern.lastIndex = 0;
      return [...source.matchAll(pattern)].map((match) => (
        `${file.replace(`${process.cwd()}/`, "")}: ${match[0]}`
      ));
    });
  });

  assert.deepEqual(violations, []);
});
