import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_DOCS } from "@/lib/legal";

export const metadata: Metadata = {
  title: LEGAL_DOCS["terms-of-service"].title,
  description: LEGAL_DOCS["terms-of-service"].description,
};

export default function TermsOfServicePage() {
  return <LegalPage doc="terms-of-service" />;
}
