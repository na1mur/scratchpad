// One-off: gives every problem from before slugs one, built from its existing title and tags (no AI calls),
// with the same rules as createProblem() in src/lib/problems.ts: unique per user, -2, -3… on a clash. Each
// user's oldest problem gets the plain slug.
//
//   node scripts/backfill-slugs.mjs           dry run: prints what it would set
//   node scripts/backfill-slugs.mjs --apply   writes it
//
// Reads MONGODB_URI the way `next dev` does (.env.local first). Safe to run again: it only touches problems
// that still have no slug, and leaves existing slugs alone.
import nextEnv from "@next/env";
import mongoose from "mongoose";
import { problemSlugBase } from "../src/lib/slug.ts";

const apply = process.argv.includes("--apply");
nextEnv.loadEnvConfig(process.cwd(), true);
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI isn't set (looked in .env.local and .env).");
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
const problems = mongoose.connection.collection("problems");

const missing = await problems
  .find({ slug: { $not: { $type: "string" } } }, { projection: { userId: 1, title: 1, tags: 1, createdAt: 1 } })
  .sort({ createdAt: 1 })
  .toArray();
console.log(`${missing.length} problem(s) without a slug.${apply ? "" : " Dry run; pass --apply to write."}`);

/** Every slug a user already has, including those assigned earlier in this run. */
const usedByUser = new Map();
async function usedSlugs(userId) {
  const key = String(userId);
  if (!usedByUser.has(key)) {
    const rows = await problems.find({ userId, slug: { $type: "string" } }, { projection: { slug: 1 } }).toArray();
    usedByUser.set(key, new Set(rows.map((r) => r.slug)));
  }
  return usedByUser.get(key);
}

let written = 0;
let failed = 0;
for (const p of missing) {
  const used = await usedSlugs(p.userId);
  const base = problemSlugBase(p.title ?? "", p.tags ?? []);
  let n = 1;
  while (used.has(n === 1 ? base : `${base}-${n}`)) n++;
  const slug = n === 1 ? base : `${base}-${n}`;
  used.add(slug);
  console.log(`  ${p._id}  ${JSON.stringify(p.title)}  ->  ${slug}`);
  if (!apply) continue;
  try {
    // The filter skips a problem that got a slug since it was read.
    const { modifiedCount } = await problems.updateOne(
      { _id: p._id, slug: { $not: { $type: "string" } } },
      { $set: { slug } },
    );
    written += modifiedCount;
  } catch (err) {
    // A duplicate means the app created a problem with this slug meanwhile; run the script again.
    failed++;
    console.error(`    failed: ${err instanceof Error ? err.message : err}`);
  }
}

if (apply) console.log(`Done: ${written} updated${failed ? `, ${failed} failed (run it again)` : ""}.`);
await mongoose.disconnect();
