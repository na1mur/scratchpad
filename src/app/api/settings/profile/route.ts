import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson, requireUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { profileSchema } from "@/lib/schemas/auth";
import { publicUser } from "@/lib/serializers";
import { User } from "@/models/User";

export function PATCH(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser();
    const { name } = await parseJson(req, profileSchema);
    await connectDB();
    const user = await User.findByIdAndUpdate(session.userId, { $set: { name } }, { returnDocument: "after" }).lean();
    return NextResponse.json({ user: publicUser(user!) });
  });
}
