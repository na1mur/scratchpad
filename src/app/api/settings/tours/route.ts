import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson, requireUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { tourSeenSchema } from "@/lib/schemas/settings";
import { User } from "@/models/User";

/** Remembers that a first-run tour was shown, so it isn't shown again. */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { tour } = await parseJson(req, tourSeenSchema);
    await connectDB();
    await User.updateOne({ _id: session.userId }, { $addToSet: { "preferences.toursSeen": tour } });
    return NextResponse.json({ tour });
  });
}

/** Shows the tours again, to anyone, however old the account. */
export function DELETE(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    await connectDB();
    await User.updateOne({ _id: session.userId }, { $set: { "preferences.toursSeen": [] } });
    return NextResponse.json({ ok: true });
  });
}
