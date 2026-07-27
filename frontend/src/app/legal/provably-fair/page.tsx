import type { Metadata } from "next";

import { LegalDocumentShell } from "@/features/legal/LegalDocumentShell";

export const metadata: Metadata = { title: "Provably Fair — Vault" };

export default function ProvablyFairPage() {
  return <LegalDocumentShell documentId="provably-fair" />;
}
