"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { sanitizeCatalogReturnPath } from "@/lib/catalog";

export function CatalogReturnLink({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const href = sanitizeCatalogReturnPath(searchParams.get("returnTo"));
  return <Link className={className} href={href}>← Вернуться к результатам каталога</Link>;
}
