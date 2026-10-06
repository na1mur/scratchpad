import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ApiError } from "@/lib/api";
import { env, r2Enabled } from "@/lib/env";

let client: S3Client | null = null;

function r2(): S3Client {
  if (!r2Enabled) throw new ApiError(503, "uploads_disabled", "Image uploads aren't configured on this server.");
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    // Default checksum query params on presigned PUTs break browser uploads to R2.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

export { r2Enabled };

export function presignPut(key: string, contentType: string, contentLength: number): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn: 5 * 60 },
  );
}

export function presignGet(key: string, expiresIn = 10 * 60): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), { expiresIn });
}

export async function headObject(key: string): Promise<{ size: number; contentType: string | undefined } | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch {
    return null;
  }
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await r2().send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  if (!res.Body) throw new Error("empty object");
  return res.Body.transformToByteArray();
}

export async function putJson(key: string, value: unknown): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: "application/json",
    }),
  );
}

export async function getJson<T>(key: string): Promise<T> {
  const bytes = await getObjectBytes(key);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function deleteKeys(keys: string[]): Promise<void> {
  if (!r2Enabled || keys.length === 0) return;
  for (let i = 0; i < keys.length; i += 1000) {
    await r2().send(
      new DeleteObjectsCommand({
        Bucket: env.R2_BUCKET,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
