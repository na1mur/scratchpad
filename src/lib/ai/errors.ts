import "server-only";
import { APICallError, RetryError } from "ai";
import { ApiError } from "@/lib/api";

function unwrap(err: unknown): unknown {
  return RetryError.isInstance(err) ? (err.lastError ?? err) : err;
}

/**
 * Turns provider failures into friendly messages. Provider error bodies can
 * echo request details, so the raw message is never passed through.
 */
export function toFriendlyProviderError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const e = unwrap(err);
  if (APICallError.isInstance(e)) {
    const status = e.statusCode ?? 0;
    const body = (e.responseBody ?? "").toLowerCase();
    if (status === 401 || status === 403 || body.includes("invalid_api_key") || body.includes("authentication")) {
      return new ApiError(400, "invalid_key", "The provider rejected your API key. Check it in Settings.");
    }
    if (status === 402 || body.includes("insufficient_quota") || body.includes("credit")) {
      return new ApiError(402, "quota_exceeded", "Your provider account is out of credits or over quota.");
    }
    if (status === 429) {
      return new ApiError(429, "provider_rate_limited", "The provider is rate limiting you. Wait a moment and retry.");
    }
    if (status === 404 || body.includes("model_not_found") || body.includes("not_found_error")) {
      return new ApiError(400, "model_not_found", "That model isn't available for your key. Pick another in Settings.");
    }
    if (status >= 500) {
      return new ApiError(502, "provider_unavailable", "The AI provider is having trouble right now. Try again shortly.");
    }
    return new ApiError(502, "provider_error", `The AI provider returned an error (${status || "network"}).`);
  }
  return new ApiError(502, "provider_error", "Couldn't reach the AI provider.");
}
