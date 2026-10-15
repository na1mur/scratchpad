import "server-only";
import { Types } from "mongoose";
import { buildActivity, todayIn, type ActivityData } from "@/lib/activity";
import { connectDB } from "@/lib/db";
import { Attempt } from "@/models/Attempt";

/** A zone name the runtime knows, else UTC. Mongo reads the same IANA names. */
function validZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    todayIn(tz);
    return tz;
  } catch {
    return "UTC";
  }
}

async function attemptsPerDay(userId: string, timezone: string): Promise<Map<string, number>> {
  // One row per day the learner worked, so the result stays small however many attempts they have.
  const rows = await Attempt.aggregate<{ _id: string; n: number }>([
    // Failed runs are discarded when they fail, but never count one if it's still around.
    { $match: { userId: new Types.ObjectId(userId), status: { $ne: "error" } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone } }, n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

/** The learner's attempts per day, bucketed in their own time zone (`tz`, an IANA name from the browser). */
export async function getActivity(userId: string, tz?: string): Promise<ActivityData> {
  await connectDB();
  let zone = validZone(tz);
  let perDay: Map<string, number>;
  try {
    perDay = await attemptsPerDay(userId, zone);
  } catch (err) {
    if (zone === "UTC") throw err;
    // The runtime knew the zone but MongoDB's database didn't.
    zone = "UTC";
    perDay = await attemptsPerDay(userId, zone);
  }
  return buildActivity(perDay, zone, todayIn(zone));
}
