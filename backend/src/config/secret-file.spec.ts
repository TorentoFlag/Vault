import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { optionalString, optionalStringFromFile } from "./secret-file";

describe("secret-file helpers", () => {
  it("normalizes empty strings without reading files", () => {
    expect(optionalString(undefined)).toBeUndefined();
    expect(optionalString("   ")).toBeUndefined();
    expect(optionalString(" value\n")).toBe("value");
    expect(optionalStringFromFile(undefined)).toBeUndefined();
    expect(optionalStringFromFile("   ")).toBeUndefined();
  });

  it("loads and trims a secret from a file path", () => {
    const directory = mkdtempSync(join(tmpdir(), "vault-secret-file-"));
    const secretPath = join(directory, "database-url");
    writeFileSync(secretPath, "postgres://vault:secret@postgres:5432/vault\n", "utf8");

    expect(optionalStringFromFile(secretPath)).toBe("postgres://vault:secret@postgres:5432/vault");
  });
});
