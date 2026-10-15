import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseWith, requireUser } from "@/lib/api";
import { getActivity } from "@/lib/activityData";

const querySchema = z.object({ tz: z.string().max(64).optional() });

/** The signed-in learner's attempts per day over the past year, for the profile page's calendar. */
export function GET(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { tz } = parseWith(querySchema, Object.fromEntries(req.nextUrl.searchParams));
    return NextResponse.json({ activity: await getActivity(session.userId, tz) });
  });
}
