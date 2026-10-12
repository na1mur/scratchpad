import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, objectIdSchema, parseJson, parseWith, requireAdmin } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { roleSchema } from "@/lib/schemas/admin";
import { User } from "@/models/User";

/** Makes a user an admin, or an admin a user. Admins only; nobody can change their own role. */
export function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/users/[id]/role">) {
  return handle(req, async () => {
    const session = await requireAdmin();
    const id = parseWith(objectIdSchema, (await ctx.params).id);
    const { role } = await parseJson(req, roleSchema);
    // Keeps at least one admin: the requester always stays one.
    if (id === session.userId) throw new ApiError(400, "self_role", "You can't change your own role.");
    await connectDB();
    const { matchedCount } = await User.updateOne({ _id: id }, { $set: { role } });
    if (!matchedCount) throw new ApiError(404, "not_found", "That user no longer exists.");
    return NextResponse.json({ role });
  });
}
