import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;
// Compared against when the email is unknown, so login timing doesn't reveal
// which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("dsabuddy-timing-equalizer", COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string | null | undefined) {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return Boolean(hash) && ok;
}
