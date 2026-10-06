export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Importing env validates it; a bad config stops the server at startup.
    await import("@/lib/env");
  }
}
