import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailForm } from "./verify-email-form";
import { AuthScreen } from "../auth-screen";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyEmailPage() {
  return (
    <AuthScreen specimen="window" seed={31} designSide="left">
      <Suspense>
        <VerifyEmailForm />
      </Suspense>
    </AuthScreen>
  );
}
