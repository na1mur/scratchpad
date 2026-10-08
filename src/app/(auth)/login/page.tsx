import type { Metadata } from "next";
import { Suspense } from "react";
import { googleEnabled } from "@/lib/env";
import { AuthForm } from "../auth-form";
import { AuthScreen } from "../auth-screen";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthScreen specimen="twoPointers" seed={11} designSide="right">
      <Suspense>
        <AuthForm mode="login" googleEnabled={googleEnabled} />
      </Suspense>
    </AuthScreen>
  );
}
