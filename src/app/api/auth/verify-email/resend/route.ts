import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson } from "@/lib/api";
import { enforceSendLimits, sendOtp } from "@/lib/auth/otp-flow";
import { connectDB } from "@/lib/db";
import { emailOnlySchema } from "@/lib/schemas/auth";
import { User, isUnverified } from "@/models/User";

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const { email } = await parseJson(req, emailOnlySchema);
    await enforceSendLimits(email, "verify_email");
    await connectDB();
    const user = await User.findOne({ email }).lean();
    // Answers the same whether or not there is something to send.
    if (user && isUnverified(user)) await sendOtp(user, "verify_email");
    return NextResponse.json({ ok: true });
  });
}
