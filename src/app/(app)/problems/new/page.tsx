import type { Metadata } from "next";
import { NewProblemForm } from "./new-problem-form";

export const metadata: Metadata = { title: "New problem" };

export default function NewProblemPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New problem</h1>
        <p className="text-sm text-muted-foreground">
          Start with the statement. You&apos;ll add your pseudo-code and reasoning on the next screen.
        </p>
      </div>
      <NewProblemForm />
    </main>
  );
}
