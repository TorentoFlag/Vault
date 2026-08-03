import type { Metadata } from "next";

import { LegalDocumentShell } from "@/features/legal/LegalDocumentShell";

export const metadata: Metadata = { title: "Политика конфиденциальности и обработки персональных данных — Vault" };

export default function PrivacyPage() {
  return <LegalDocumentShell documentId="privacy" />;
}
