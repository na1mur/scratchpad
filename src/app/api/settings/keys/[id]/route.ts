import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { deleteSavedKey } from "@/lib/providerKeys";
import { keyDetailsSchema } from "@/lib/schemas/settings";
import { publicUser } from "@/lib/serializers";
import { loadUser } from "@/lib/users";
import { ProviderKey } from "@/models/ProviderKey";

async function ownedKeyId(ctx: RouteContext<"/api/settings/keys/[id]">) {
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "not_found", "Saved key not found.");
  return id;
}

export function PATCH(req: NextRequest, ctx: RouteContext<"/api/settings/keys/[id]">) {
  return handle(req, async () => {
    const session = await requireUser();
    const id = await ownedKeyId(ctx);
    const { label, note } = await parseJson(req, keyDetailsSchema);
    // An empty field removes the name or note.
    const set: Record<string, string> = {};
    const unset: Record<string, 1> = {};
    if (label) set.label = label;
    else unset.label = 1;
    if (note) set.note = note;
    else unset.note = 1;
    const update = { ...(Object.keys(set).length > 0 && { $set: set }), ...(Object.keys(unset).length > 0 && { $unset: unset }) };
    const res = await ProviderKey.updateOne({ _id: id, userId: session.userId }, update);
    if (!res.matchedCount) throw new ApiError(404, "not_found", "Saved key not found.");
    return NextResponse.json({ ok: true });
  });
}

export function DELETE(req: NextRequest, ctx: RouteContext<"/api/settings/keys/[id]">) {
  return handle(req, async () => {
    const session = await requireUser();
    const id = await ownedKeyId(ctx);
    const user = await loadUser(session);
    const cleared = await deleteSavedKey(user, id);
    const updated = cleared.length ? await loadUser(session) : user;
    // The client resets the provider form from this, and asks for a new key when the main one went.
    return NextResponse.json({ cleared, user: publicUser(updated) });
  });
}
