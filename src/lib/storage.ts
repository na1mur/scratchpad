import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { ApiError } from "@/lib/api";
import { cloudinaryEnabled, env } from "@/lib/env";

export { cloudinaryEnabled as storageEnabled };

let configured = false;

function sdk() {
  if (!cloudinaryEnabled) throw new ApiError(503, "uploads_disabled", "Image uploads aren't configured on this server.");
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

/**
 * Where a key lives in Cloudinary. Everything is stored with delivery type `authenticated`, so a file is only
 * reachable through a signed URL from here. Images drop their extension from the public id (Cloudinary puts
 * it back as the delivery format); JSON goes in as a raw file, whose public id keeps its extension.
 */
function locate(key: string) {
  if (key.endsWith(".json")) return { resourceType: "raw" as const, publicId: key, format: undefined };
  const dot = key.lastIndexOf(".");
  if (dot <= key.lastIndexOf("/")) return { resourceType: "image" as const, publicId: key, format: undefined };
  return { resourceType: "image" as const, publicId: key.slice(0, dot), format: key.slice(dot + 1) };
}

export async function putObject(key: string, body: Uint8Array): Promise<void> {
  const { resourceType, publicId } = locate(key);
  const api = sdk();
  await new Promise<void>((resolve, reject) => {
    const stream = api.uploader.upload_stream(
      { public_id: publicId, resource_type: resourceType, type: "authenticated", overwrite: true, invalidate: true },
      (err, result) => (err || !result ? reject(err ?? new Error("Cloudinary returned no result")) : resolve()),
    );
    stream.end(Buffer.from(body));
  });
}

export function putJson(key: string, value: unknown): Promise<void> {
  return putObject(key, new TextEncoder().encode(JSON.stringify(value)));
}

/** Where the browser loads the object from: a signed URL, computed locally, that doesn't expire. */
export function viewUrl(key: string): string {
  const { resourceType, publicId, format } = locate(key);
  return sdk().url(publicId, { resource_type: resourceType, type: "authenticated", sign_url: true, secure: true, format });
}

/** The object's bytes, or null if it isn't there. */
export async function tryGetObjectBytes(key: string): Promise<Uint8Array | null> {
  const res = await fetch(viewUrl(key), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cloudinary answered ${res.status} for ${key}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const bytes = await tryGetObjectBytes(key);
  if (!bytes) throw new Error(`object not found: ${key}`);
  return bytes;
}

export async function getJson<T>(key: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await getObjectBytes(key))) as T;
}

export async function deleteKeys(all: string[]): Promise<void> {
  const keys = [...new Set(all)];
  if (!cloudinaryEnabled || keys.length === 0) return;
  const api = sdk();
  for (let i = 0; i < keys.length; i += 10) {
    await Promise.all(
      keys.slice(i, i + 10).map((key) => {
        const { resourceType, publicId } = locate(key);
        return api.uploader.destroy(publicId, { resource_type: resourceType, type: "authenticated", invalidate: true });
      }),
    );
  }
}
