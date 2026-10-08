import type { Metadata } from "next";
import { Suspense } from "react";
import { googleEnabled } from "@/lib/env";
import { AuthForm } from "../auth-form";
import { AuthScreen } from "../auth-screen";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <AuthScreen specimen="binarySearch" seed={23} designSide="left">
      <Suspense>
        <AuthForm mode="signup" googleEnabled={googleEnabled} />
      </Suspense>
    </AuthScreen>
  );
}
