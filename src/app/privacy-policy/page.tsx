import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_DOCS } from "@/lib/legal";

export const metadata: Metadata = {
  title: LEGAL_DOCS["privacy-policy"].title,
  description: LEGAL_DOCS["privacy-policy"].description,
};

export default function PrivacyPolicyPage() {
  return <LegalPage doc="privacy-policy" />;
}
