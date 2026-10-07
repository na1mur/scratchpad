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

export function ProviderSummary({ ai }: { ai: PublicUser["ai"] }) {
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
          <span className="font-mono text-[13px]">{maskKey(ai.keyLast4)}</span>
        </Row>
      </dl>
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
    </div>
  );
}
