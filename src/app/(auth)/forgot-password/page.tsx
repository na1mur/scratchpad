import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "./forgot-password-form";
import { AuthScreen } from "../auth-screen";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthScreen specimen="brackets" seed={47} designSide="right">
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </AuthScreen>
  );
}
