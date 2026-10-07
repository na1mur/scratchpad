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
    if (body.includes("context_length_exceeded") || body.includes("maximum context length")) {
      return new ApiError(400, "context_too_long", "This problem is too long for the selected model. Pick a model with a larger context in Settings.");
    }
    if ((body.includes("response_format") || body.includes("json_schema")) && body.includes("not supported")) {
      return new ApiError(400, "unsupported_model", "The selected model doesn't support structured output. Pick a newer model in Settings.");
    }
    if (status >= 500) {
      return new ApiError(502, "provider_unavailable", "The AI provider is having trouble right now. Try again shortly.");
    }
    // Server log only: the body can echo request details, so it never reaches the client.
    console.error(`[provider] ${status || "network"} error:`, (e.responseBody ?? e.message).slice(0, 2000));
    return new ApiError(502, "provider_error", `The AI provider returned an error (${status || "network"}).`);
  }
  return new ApiError(502, "provider_error", "Couldn't reach the AI provider.");
}
