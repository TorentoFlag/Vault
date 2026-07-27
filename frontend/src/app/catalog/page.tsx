import type { Metadata } from "next";
import { Suspense } from "react";

import { CatalogScreen } from "@/features/catalog/CatalogScreen";

import { CatalogLoading } from "./loading";

export const metadata: Metadata = {
  title: "Каталог цифровых товаров — Vault",
  description: "Пополнение Steam, GPT и игровые предметы в каталоге Vault.",
};

export default function CatalogPage() {
  return (
    <Suspense fallback={<CatalogLoading />}>
      <CatalogScreen />
    </Suspense>
  );
}
