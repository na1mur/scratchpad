import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { listSavedKeys } from "@/lib/providerKeys";
import { loadUser } from "@/lib/users";

export function GET(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser();
    const keys = await listSavedKeys(await loadUser(session));
    return NextResponse.json({ keys });
  });
}
