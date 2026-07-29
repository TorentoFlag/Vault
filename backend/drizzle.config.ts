import { readFileSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

function optionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function optionalStringFromFile(path: string | undefined): string | undefined {
  const normalizedPath = optionalString(path);
  if (normalizedPath === undefined) return undefined;
  return optionalString(readFileSync(normalizedPath, "utf8"));
}

const databaseUrl =
  optionalString(process.env.DATABASE_URL) ??
  optionalStringFromFile(process.env.DATABASE_URL_FILE) ??
  "postgres://vault:vault_dev_password@localhost:55432/vault";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
