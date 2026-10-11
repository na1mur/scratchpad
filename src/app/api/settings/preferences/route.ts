import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson, requireUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { preferencesSchema } from "@/lib/schemas/settings";
import { User } from "@/models/User";

/** Saves UI preferences that apply to every problem, such as where the chat sits. */
export function PATCH(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { chatLayout } = await parseJson(req, preferencesSchema);
    await connectDB();
    await User.updateOne({ _id: session.userId }, { $set: { "preferences.chatLayout": chatLayout } });
    return NextResponse.json({ preferences: { chatLayout } });
  });
}
