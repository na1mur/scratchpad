"use client";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time; concurrent 401s share the same rotation. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok || r.status === 409)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function redirectToLogin() {
  const next = window.location.pathname + window.location.search;
  // A full reload is intended here: it drops all client state of the dead session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

type ApiInit = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** For calls where a 401 is a normal answer (wrong password), not a dead session: no refresh, no redirect. */
  skipRefresh?: boolean;
};

/** Raw fetch with the refresh-and-retry-once behaviour. Use for streams. */
export async function apiRaw(input: string, init: ApiInit = {}): Promise<Response> {
  const { body, skipRefresh, ...rest } = init;
  const isJsonBody = body !== undefined && !(body instanceof FormData) && typeof body !== "string";
  const headers = new Headers(rest.headers);
  if (isJsonBody) headers.set("Content-Type", "application/json");
  const doFetch = () =>
    fetch(input, {
      ...rest,
      headers,
      credentials: "same-origin",
      body: isJsonBody ? JSON.stringify(body) : (body as BodyInit | undefined),
    });

  let res = await doFetch();
  if (res.status === 401 && !skipRefresh) {
    if (await refreshSession()) res = await doFetch();
    if (res.status === 401) {
      redirectToLogin();
      throw new ApiClientError(401, "unauthorized", "Your session has expired.");
    }
  }
  return res;
}

export async function toApiError(res: Response): Promise<ApiClientError> {
  const data = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string; fields?: Record<string, string[]> };
  } | null;
  return new ApiClientError(
    res.status,
    data?.error?.code ?? "unknown",
    data?.error?.message ?? `Request failed (${res.status})`,
    data?.error?.fields,
  );
}

/** JSON API call. Throws ApiClientError with the server's friendly message. */
export async function api<T>(input: string, init: ApiInit = {}): Promise<T> {
  const res = await apiRaw(input, init);
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}
