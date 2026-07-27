import type { Product } from "@/types/commerce";

/** Text used in image-free product artwork across the marketplace. */
export function getProductVisualLabel(product: Pick<Product, "kind" | "game">) {
  if (product.kind === "steam") return "STEAM";
  if (product.kind === "skins") return product.game ?? "SKINS";
  return "GPT";
}
