import "server-only";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";
import { getJson, putJson, r2Enabled } from "@/lib/r2";

const INLINE_LIMIT_BYTES = 1024 * 1024;

export type StoredSpec = { vizSpec: VizSpec; specR2Key?: undefined } | { vizSpec?: undefined; specR2Key: string };

/** Specs live in Mongo; one that grows past ~1 MB moves to R2 when it's configured. */
export async function storeSpec(
  userId: string,
  problemId: string,
  attemptId: string,
  version: number,
  spec: VizSpec,
): Promise<StoredSpec> {
  const size = Buffer.byteLength(JSON.stringify(spec));
  if (size <= INLINE_LIMIT_BYTES || !r2Enabled) return { vizSpec: spec };
  const key = `users/${userId}/problems/${problemId}/specs/${attemptId}-v${version}.json`;
  await putJson(key, spec);
  return { specR2Key: key };
}

export async function loadSpec(stored: { vizSpec?: unknown; specR2Key?: string | null }): Promise<VizSpec | null> {
  if (stored.vizSpec) return stored.vizSpec as VizSpec;
  if (stored.specR2Key) return getJson<VizSpec>(stored.specR2Key);
  return null;
}
