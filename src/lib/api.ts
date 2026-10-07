import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getSession, type Session } from "@/lib/auth/session";

export type ApiErrorBody = {
  error: { code: string; message: string; fields?: Record<string, string[]> };
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function errorResponse(status: number, code: string, message: string, fields?: Record<string, string[]>) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message, fields } }, { status });
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const appOrigin = new URL(env.APP_URL).origin;

/**
 * Wraps a route handler: CSRF origin check on mutations, and uniform JSON
 * errors. Unexpected errors are logged by message only, never with bodies.
 */
export async function handle(req: NextRequest, fn: () => Promise<Response>): Promise<Response> {
  if (MUTATING.has(req.method) && req.headers.get("origin") !== appOrigin) {
    return errorResponse(403, "bad_origin", "Cross-origin request rejected.");
  }
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err.status, err.code, err.message, err.fields);
    console.error(`[api] ${req.method} ${req.nextUrl.pathname} failed:`, err instanceof Error ? err.message : err);
    return errorResponse(500, "internal", "Something went wrong. Please try again.");
  }
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function requireUser(opts: { onboarded?: boolean } = {}): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "unauthorized", "Please log in.");
  if (opts.onboarded && session.onboardingStep !== "done") {
    throw new ApiError(403, "onboarding_incomplete", "Finish onboarding first.");
  }
  return session;
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be JSON.");
  }
  return parseWith(schema, body);
}

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = z.flattenError(result.error).fieldErrors as Record<string, string[]>;
    throw new ApiError(400, "validation", result.error.issues[0]?.message ?? "Invalid input.", fields);
  }
  return result.data;
}

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
