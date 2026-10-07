import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { PipelineError, UsageMeter, generateStructured } from "@/lib/ai/pipeline/llm";
import { baseInstructions } from "@/lib/ai/prompts/system";
import { getModel } from "@/lib/ai/providers";
import { getOwnedProblem } from "@/lib/problems";
import { getObjectBytes, headObject, r2Enabled } from "@/lib/r2";
import { rateLimits } from "@/lib/rateLimit";
import { MAX_IMAGE_BYTES, extractSchema, extractionOutputSchema } from "@/lib/schemas/uploads";
import { loadUser } from "@/lib/users";

export const maxDuration = 120;

const EXTRACT_ROLE = `Your job right now: transcribe a photo of the learner's notebook and sort what's on the page into two fields.
- pseudoCode: the code or step-by-step algorithm (assignments, loops, conditions, returns, function signatures).
- notes: the idea / explanation: prose about why the approach should work, what it relies on, observations, examples worked by hand. Leave it empty if the page has none.
Put each piece of text in exactly one field; never repeat it in both. A page may hold only code, only notes, or both.
Copy their handwriting faithfully, character for character where legible.
Preserve their mistakes, odd names, off-by-ones and missing cases exactly. Do not fix, complete, reformat into another language, or improve anything.
Keep their line breaks and indentation. Mark a word you truly can't read as [?].`;

/**
 * Sends an uploaded notebook photo to the vision model. The transcription
 * goes back into the editor for the learner to review; it is never
 * submitted on their behalf.
 */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    if (!r2Enabled) throw new ApiError(503, "uploads_disabled", "Image uploads aren't configured on this server.");
    const { problemId, r2Key, mimeType } = await parseJson(req, extractSchema);
    if (!r2Key.startsWith(`users/${session.userId}/problems/${problemId}/`)) {
      throw new ApiError(403, "forbidden", "That image doesn't belong to you.");
    }
    const problem = await getOwnedProblem(session.userId, problemId);
    const limit = await rateLimits.attempts().consume(`extract:${session.userId}`);
    if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many extractions. Try again later.");

    const head = await headObject(r2Key);
    if (!head) throw new ApiError(404, "not_found", "Upload not found. Try uploading again.");
    if (head.size > MAX_IMAGE_BYTES) throw new ApiError(400, "too_large", "Images must be 8 MB or smaller.");

    const user = await loadUser(session);
    const { model } = getModel(user, "vision");
    const data = await getObjectBytes(r2Key);
    try {
      const out = await generateStructured({
        model,
        meter: new UsageMeter(),
        name: "transcription",
        schema: extractionOutputSchema,
        instructions: baseInstructions(problem.language, EXTRACT_ROLE),
        prompt: "Transcribe this notebook page.",
        images: [{ data, mediaType: mimeType }],
      });
      if (!out.legible || (!out.pseudoCode.trim() && !out.notes.trim())) {
        throw new ApiError(422, "illegible", "Couldn't find readable code or notes in that image. Try a clearer photo.");
      }
      return NextResponse.json({ pseudoCode: out.pseudoCode, notes: out.notes });
    } catch (err) {
      if (err instanceof PipelineError) throw new ApiError(502, err.code, err.message);
      throw err;
    }
  });
}
