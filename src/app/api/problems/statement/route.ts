import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { fetchSourceText } from "@/lib/problemSource";
import { rateLimits } from "@/lib/rateLimit";
import { MAX_TEXT, fetchStatementSchema } from "@/lib/schemas/problems";

/**
 * Reads the statement off a problem link for the new-problem form. `statement` is null when the page
 * can't be read (a login wall, a site that needs JavaScript, no problem on it), which isn't an error:
 * the form asks for the statement by hand instead.
 */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { url } = await parseJson(req, fetchStatementSchema);
    const limit = await rateLimits.statementLookups().consume(session.userId);
    if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many lookups. Try again in a few minutes.");
    return NextResponse.json({ statement: await fetchSourceText(url, MAX_TEXT) });
  });
}
