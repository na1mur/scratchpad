import { PASSWORD_RULES } from "@/lib/schemas/auth";

export function PasswordRules() {
  return (
    <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
      {PASSWORD_RULES.map((rule) => (
        <li key={rule}>{rule}</li>
      ))}
    </ul>
  );
}
