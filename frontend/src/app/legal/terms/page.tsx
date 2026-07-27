import type { Metadata } from "next";

import { LegalDocumentShell } from "@/features/legal/LegalDocumentShell";

export const metadata: Metadata = { title: "Пользовательское соглашение — Vault" };

export default function TermsPage() {
  return <LegalDocumentShell documentId="terms" />;
}
