import "server-only";
import { upgradeSpec, type VizSpec, type VizSpecV1 } from "@/lib/ai/schemas/vizSpec";
import { getJson, putJson, storageEnabled } from "@/lib/storage";

export type StoredSpec = { vizSpec: VizSpec; specKey?: undefined } | { vizSpec?: undefined; specKey: string };

/**
 * Every spec goes to file storage (Cloudinary), keeping the database small. Only when storage isn't
 * configured, or an upload fails, does it stay inline in Mongo, so a run still finishes.
 */
export async function storeSpec(
  userId: string,
  problemId: string,
  attemptId: string,
  version: number,
  spec: VizSpec,
): Promise<StoredSpec> {
  if (!storageEnabled) return { vizSpec: spec };
  const key = `users/${userId}/problems/${problemId}/specs/${attemptId}-v${version}.json`;
  try {
    await putJson(key, spec);
    return { specKey: key };
  } catch (err) {
    console.error("[specs] upload failed, keeping the spec in the database:", err instanceof Error ? err.message : err);
    return { vizSpec: spec };
  }
}

/** Specs from before test cases existed come back as a single case. */
export async function loadSpec(stored: { vizSpec?: unknown; specKey?: string | null }): Promise<VizSpec | null> {
  if (stored.vizSpec) return restoreEmptyObjects(upgradeSpec(stored.vizSpec as VizSpec | VizSpecV1));
  if (stored.specKey) return upgradeSpec(await getJson<VizSpec | VizSpecV1>(stored.specKey));
  return null;
}

/**
 * Mongoose used to drop empty objects from stored spec versions (`minimize`), so older specs can have
 * a step with no `states`, or a variables state with no `vars`, which the renderers can't handle.
 * Puts them back.
 */
function restoreEmptyObjects(spec: VizSpec): VizSpec {
  for (const step of spec.cases.flatMap((c) => c.steps ?? [])) {
    step.states ??= {};
    for (const state of Object.values(step.states)) {
      if (state.kind === "variables") state.vars ??= {};
    }
  }
  return spec;
}
