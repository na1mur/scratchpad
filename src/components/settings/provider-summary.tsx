import { KeyRoundIcon } from "lucide-react";
import { PROVIDER_LABELS } from "@/lib/providers";
import type { PublicUser } from "@/lib/serializers";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  );
}

/** Masked key: only the last four characters ever reach the client. */
const maskKey = (last4: string) => `••••••••${last4}`;

export function ProviderSummary({ ai, search }: { ai: PublicUser["ai"]; search: PublicUser["search"] }) {
  if (!ai) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No AI provider is configured yet. Set one up below.
      </div>
    );
  }
  const { vision } = ai;
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Currently in use</p>
      <dl className="flex flex-col gap-1.5">
        <Row label="Provider">{PROVIDER_LABELS[ai.provider]}</Row>
        <Row label="Model">
          <span className="font-mono text-[13px]">{ai.model}</span>
        </Row>
        <Row label="API key">
          {ai.keyLast4 ? (
            <span className="font-mono text-[13px]">{maskKey(ai.keyLast4)}</span>
          ) : (
            <span className="text-destructive">None</span>
          )}
        </Row>
      </dl>
      {!ai.keyLast4 && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <KeyRoundIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          The key this model used was deleted, so analysis is paused. Pick one of your saved keys or add a new one
          below, then save.
        </p>
      )}
      <div className="border-t pt-3">
        {vision ? (
          <dl className="flex flex-col gap-1.5">
            <Row label="Vision model">
              <span className="font-mono text-[13px]">
                {PROVIDER_LABELS[vision.provider]} · {vision.model}
              </span>
            </Row>
            <Row label="Vision API key">
              {vision.hasOwnKey && vision.keyLast4 ? (
                <span className="font-mono text-[13px]">{maskKey(vision.keyLast4)}</span>
              ) : (
                "Same as main key"
              )}
            </Row>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No vision model. Notebook photo uploads are off.</p>
        )}
      </div>
      <div className="border-t pt-3">
        {search?.enabled && search.keyLast4 ? (
          <dl className="flex flex-col gap-1.5">
            <Row label="Web search">On · Tavily</Row>
            <Row label="Tavily API key">
              <span className="font-mono text-[13px]">{maskKey(search.keyLast4)}</span>
            </Row>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Web search is off.</p>
        )}
      </div>
    </div>
  );
}
