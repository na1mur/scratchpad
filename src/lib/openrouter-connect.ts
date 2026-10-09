// "Connect with OpenRouter": OpenRouter's OAuth PKCE flow, run entirely in the
// browser. It needs no client registration or secret; the result is an ordinary
// OpenRouter API key owned by the user, which then goes through the same form
// and encrypted storage as a pasted key. https://openrouter.ai/docs/use-cases/oauth-pkce

const VERIFIER_KEY = "openrouter-pkce-verifier";
const RETURN_KEY = "openrouter-return-to";
const AUTH_URL = "https://openrouter.ai/auth";
const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sends the browser to OpenRouter, which returns to the current page with `?code=`. */
export async function startOpenRouterConnect(returnTo?: string | null) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  // sessionStorage, not localStorage: the verifier shouldn't outlive the tab.
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    // The callback URL can't carry a query string, so the way back waits here.
    if (returnTo) sessionStorage.setItem(RETURN_KEY, returnTo);
    else sessionStorage.removeItem(RETURN_KEY);
  } catch {
    throw new Error("Your browser blocked site storage, so OpenRouter can't connect. Paste a key instead.");
  }
  const url = new URL(AUTH_URL);
  url.searchParams.set("callback_url", `${window.location.origin}${window.location.pathname}`);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("key_label", "Scratchpad");
  window.location.assign(url);
}

/** The page that sent the learner to Settings, if they left for OpenRouter on the way. */
export function takeReturnTo(): string | null {
  try {
    const back = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return back;
  } catch {
    return null;
  }
}

function takeVerifier(): string | null {
  try {
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    return verifier;
  } catch {
    return null;
  }
}

/**
 * Trades the code OpenRouter sent back for the user's key. A code without the
 * verifier this tab stored is useless, so a forged callback link can't plant a key.
 */
export async function finishOpenRouterConnect(code: string): Promise<string> {
  const verifier = takeVerifier();
  if (!verifier) throw new Error("This OpenRouter sign-in expired. Try connecting again.");
  let res: Response;
  try {
    res = await fetch(EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    });
  } catch {
    throw new Error("Couldn't reach OpenRouter. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => null)) as { key?: string } | null;
  if (!res.ok || !data?.key) throw new Error("OpenRouter didn't accept this sign-in. Try connecting again.");
  return data.key;
}
