import "server-only";
import { createHmac } from "node:crypto";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api";
import { decrypt, encrypt, last4 } from "@/lib/crypto";
import { connectDB } from "@/lib/db";
import { env } from "@/lib/env";
import type { KeyProviderId } from "@/lib/providers";
import { ProviderKey, type ProviderKeyDoc } from "@/models/ProviderKey";
import { User, type UserDoc } from "@/models/User";

/**
 * Every API key a user enters is kept here, one entry per distinct key and provider, so switching
 * providers back and forth never means pasting a key again. The settings on User point at the key in
 * use (`keyId`) and keep an encrypted copy of it, so `getModel()` stays a plain read. The copy can't go
 * stale: a saved key's value never changes, and deleting a key in use removes the copy too
 * (`deleteSavedKey()`), after which the learner is asked to activate another.
 */

export const MAX_SAVED_KEYS = 20;

export type KeyUse = "main" | "vision" | "search";

/** What the client sees of a saved key: never the key itself or its fingerprint. */
export type SavedKeyRow = {
  id: string;
  provider: KeyProviderId;
  label: string | null;
  note: string | null;
  keyLast4: string;
  rejected: boolean;
  usedBy: KeyUse[];
};

function fingerprint(userId: Types.ObjectId | string, provider: KeyProviderId, key: string): string {
  return createHmac("sha256", env.ENCRYPTION_KEY).update(`provider-key:${userId}:${provider}:${key}`).digest("hex");
}

const isDuplicateKeyError = (err: unknown) => (err as { code?: number })?.code === 11000;

/**
 * Adds a key to the user's saved keys, or finds it if it's already there, and marks it as just used.
 * A note given with it replaces the saved one; without one, the saved note stays.
 */
export async function saveKey(
  userId: Types.ObjectId | string,
  provider: KeyProviderId,
  key: string,
  note?: string,
): Promise<ProviderKeyDoc> {
  await connectDB();
  const filter = { userId, fingerprint: fingerprint(userId, provider, key) };
  const now = new Date();
  const existing = await ProviderKey.findOneAndUpdate(
    filter,
    { $set: { lastUsedAt: now, ...(note && { note }) } },
    { returnDocument: "after" },
  ).lean();
  if (existing) return existing;

  if ((await ProviderKey.countDocuments({ userId })) >= MAX_SAVED_KEYS) {
    throw new ApiError(
      409,
      "key_limit",
      `You have ${MAX_SAVED_KEYS} saved keys. Delete one under Saved API keys in Settings to add another.`,
    );
  }
  try {
    const created = await ProviderKey.create({
      ...filter,
      provider,
      apiKey: encrypt(key),
      keyLast4: last4(key),
      lastUsedAt: now,
      ...(note && { note }),
    });
    return created.toObject();
  } catch (err) {
    // Saved by a concurrent request a moment ago.
    if (!isDuplicateKeyError(err)) throw err;
    const raced = await ProviderKey.findOne(filter).lean();
    if (!raced) throw err;
    return raced;
  }
}

/** A saved key of this user's for this provider; anything else is refused. */
export async function getSavedKey(
  userId: Types.ObjectId | string,
  keyId: string,
  provider: KeyProviderId,
): Promise<ProviderKeyDoc> {
  await connectDB();
  const saved = Types.ObjectId.isValid(keyId) ? await ProviderKey.findOne({ _id: keyId, userId }).lean() : null;
  if (!saved || saved.provider !== provider) {
    throw new ApiError(400, "key_not_found", "That saved key no longer exists. Pick another or enter a new one.");
  }
  return saved;
}

/** Marks keys as just used, which orders them first in the form. */
export async function touchKeys(ids: (Types.ObjectId | null | undefined)[]) {
  const present = ids.filter((id): id is Types.ObjectId => Boolean(id));
  if (present.length) await ProviderKey.updateMany({ _id: { $in: present } }, { $set: { lastUsedAt: new Date() } });
}

/** Which settings use each saved key. Search only counts while it's on. */
export function keyUsage(user: Pick<UserDoc, "ai" | "search">): Map<string, KeyUse[]> {
  const usage = new Map<string, KeyUse[]>();
  const add = (id: Types.ObjectId | null | undefined, use: KeyUse) => {
    if (id) usage.set(String(id), [...(usage.get(String(id)) ?? []), use]);
  };
  add(user.ai?.keyId, "main");
  if (user.ai?.vision?.apiKey) add(user.ai.vision.keyId, "vision");
  if (user.search?.enabled) add(user.search.keyId, "search");
  return usage;
}

/**
 * Keys stored before saved keys existed live only on the user. Copies each into the saved keys and
 * points the setting at it. Safe to run any number of times: the fingerprint finds the same entry.
 */
export async function backfillSavedKeys(user: UserDoc): Promise<UserDoc> {
  const set: Record<string, Types.ObjectId> = {};
  if (user.ai?.apiKey && !user.ai.keyId) {
    set["ai.keyId"] = (await saveKey(user._id, user.ai.provider, decrypt(user.ai.apiKey)))._id;
  }
  if (user.ai?.vision?.apiKey && !user.ai.vision.keyId) {
    set["ai.vision.keyId"] = (await saveKey(user._id, user.ai.vision.provider, decrypt(user.ai.vision.apiKey)))._id;
  }
  if (user.search?.apiKey && !user.search.keyId) {
    set["search.keyId"] = (await saveKey(user._id, "tavily", decrypt(user.search.apiKey)))._id;
  }
  if (!Object.keys(set).length) return user;
  const updated = await User.findByIdAndUpdate(user._id, { $set: set }, { returnDocument: "after" }).lean();
  return updated ?? user;
}

export async function listSavedKeys(user: UserDoc): Promise<SavedKeyRow[]> {
  const current = await backfillSavedKeys(user);
  const usage = keyUsage(current);
  const keys = await ProviderKey.find({ userId: current._id })
    .sort({ provider: 1, lastUsedAt: -1 })
    .select("provider label note keyLast4 rejected")
    .lean();
  return keys.map((k) => ({
    id: String(k._id),
    provider: k.provider,
    label: k.label ?? null,
    note: k.note ?? null,
    keyLast4: k.keyLast4,
    rejected: Boolean(k.rejected),
    usedBy: usage.get(String(k._id)) ?? [],
  }));
}

export async function markKeyRejected(keyId: Types.ObjectId | null | undefined) {
  if (keyId) await ProviderKey.updateOne({ _id: keyId }, { $set: { rejected: true } });
}

export async function clearKeyRejected(keyId: Types.ObjectId | null | undefined) {
  if (keyId) await ProviderKey.updateOne({ _id: keyId, rejected: true }, { $set: { rejected: false } });
}

/** A run's provider refused the key: flag the user's main key so Settings can say so. */
export async function markMainKeyRejected(userId: Types.ObjectId | string) {
  const user = await User.findById(userId).select("ai.keyId").lean();
  await markKeyRejected(user?.ai?.keyId);
}

/**
 * Deletes a saved key, along with the copy held by any setting that used it: the main model is left
 * without a key until the learner activates another, a vision model with its own key is turned off,
 * and so is web search. Returns which settings lost their key.
 */
export async function deleteSavedKey(user: UserDoc, keyId: string): Promise<KeyUse[]> {
  const res = await ProviderKey.deleteOne({ _id: keyId, userId: user._id });
  if (!res.deletedCount) throw new ApiError(404, "not_found", "Saved key not found.");

  const uses = keyUsage(user).get(keyId) ?? [];
  const unset: Record<string, 1> = {};
  const set: Record<string, boolean> = {};
  if (uses.includes("main")) Object.assign(unset, { "ai.apiKey": 1, "ai.keyLast4": 1, "ai.keyId": 1 });
  if (uses.includes("vision")) unset["ai.vision"] = 1;
  // A switched-off search keeps its key for later; a deleted key mustn't come back that way either.
  if (String(user.search?.keyId) === keyId) {
    Object.assign(unset, { "search.apiKey": 1, "search.keyLast4": 1, "search.keyId": 1 });
    set["search.enabled"] = false;
  }
  if (Object.keys(unset).length) {
    await User.updateOne({ _id: user._id }, { $unset: unset, ...(Object.keys(set).length && { $set: set }) });
  }
  return uses;
}
