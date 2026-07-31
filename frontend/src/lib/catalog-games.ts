export const CATALOG_GAMES = ["cs2", "rust", "tf2"] as const;

export type CatalogGame = (typeof CATALOG_GAMES)[number];

export const CATALOG_GAME_LABELS: Record<CatalogGame, string> = {
  cs2: "CS2",
  rust: "Rust",
  tf2: "Team Fortress 2",
};

const catalogGameSet = new Set<string>(CATALOG_GAMES);

export function isCatalogGame(value: string): value is CatalogGame {
  return catalogGameSet.has(value);
}

export function parseCatalogGame(value: string | null | undefined): CatalogGame | undefined {
  const normalized = value?.trim().toLocaleLowerCase("en-US");
  return normalized !== undefined && isCatalogGame(normalized) ? normalized : undefined;
}

export function getCatalogGameLabel(game: CatalogGame): string {
  return CATALOG_GAME_LABELS[game];
}
