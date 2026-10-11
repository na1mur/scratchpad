import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson, requireUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { preferencesSchema } from "@/lib/schemas/settings";
import { User } from "@/models/User";

/** Saves UI preferences that apply to every problem, such as where the chat sits or how the list looks. */
export function PATCH(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const preferences = await parseJson(req, preferencesSchema);
    const $set = Object.fromEntries(
      Object.entries(preferences)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [`preferences.${key}`, value]),
    );
    await connectDB();
    await User.updateOne({ _id: session.userId }, { $set });
    return NextResponse.json({ preferences });
  });
}
