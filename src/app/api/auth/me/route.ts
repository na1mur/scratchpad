import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { publicUser } from "@/lib/serializers";
import { User } from "@/models/User";

export function GET(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser();
    await connectDB();
    const user = await User.findById(session.userId).lean();
    if (!user) throw new ApiError(401, "unauthorized", "Please log in.");
    return NextResponse.json({ user: publicUser(user) });
  });
}
