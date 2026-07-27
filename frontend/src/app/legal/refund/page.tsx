import type { Metadata } from "next";

import { LegalDocumentShell } from "@/features/legal/LegalDocumentShell";

export const metadata: Metadata = { title: "Политика возвратов — Vault" };

export default function RefundPage() {
  return <LegalDocumentShell documentId="refund" />;
}
