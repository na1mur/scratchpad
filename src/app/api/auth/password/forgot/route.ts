import { NextResponse, after, type NextRequest } from "next/server";
import { handle, parseJson } from "@/lib/api";
import { enforceSendLimits, sendOtp } from "@/lib/auth/otp-flow";
import { connectDB } from "@/lib/db";
import { emailOnlySchema } from "@/lib/schemas/auth";
import { User } from "@/models/User";

/** Always answers ok, so it can't be used to find out which emails have accounts. */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const { email } = await parseJson(req, emailOnlySchema);
    await enforceSendLimits(email, "reset_password");
    await connectDB();
    const user = await User.findOne({ email }).lean();
    // Sent after the response so timing doesn't reveal whether the account exists.
    if (user) {
      after(() =>
        sendOtp(user, "reset_password").catch((err) =>
          console.error("[auth] reset code not sent:", err instanceof Error ? err.message : err),
        ),
      );
    }
    return NextResponse.json({ ok: true });
  });
}
