/**
 * Chimes when an analysis or a solution finishes. Browsers may refuse to play before the user has
 * interacted with the page (e.g. a run picked up again after a reload); that's fine, it just stays quiet.
 */
export function playCompletionSound() {
  try {
    const audio = new Audio("/sounds/complete.mp3");
    audio.volume = 0.6;
    void audio.play().catch(() => {});
  } catch {}
}
