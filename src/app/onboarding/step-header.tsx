import { cn } from "cn";

export function StepHeader({ step, title, description }: { step: 1 | 2; title: string; description: string }) {
  return (
    <div className="mb-8 flex flex-col gap-3">
      <div className="flex items-center gap-2" aria-label={`Step ${step} of 2`}>
        {[1, 2].map((n) => (
          <span key={n} className={cn("h-1.5 w-10 rounded-full", n <= step ? "bg-primary" : "bg-muted")} />
        ))}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
