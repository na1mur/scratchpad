/**
 * First-run guided tours: one per place in the app. Each is shown once, then remembered on the user in
 * `preferences.toursSeen`. Steps point at elements by `data-tour="<name>"`; a step whose element isn't on
 * the page (no notebook upload, a passing attempt with nothing to fix, ...) is left out.
 */
export const TOURS = ["workspace", "analysis", "solution"] as const;
export type TourId = (typeof TOURS)[number];

export type TourStep = {
  /** The `data-tour` value of the element to highlight. */
  target: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
};

export const TOUR_STEPS: Record<TourId, TourStep[]> = {
  // A problem with no attempts yet.
  workspace: [
    {
      target: "statement",
      title: "The problem statement",
      description: "Open it any time to re-read the problem without leaving your attempt.",
      side: "bottom",
    },
    {
      target: "pseudo",
      title: "Write your approach here",
      description:
        "Pseudo-code or real code, in any language. It doesn't have to be neat: it's run step by step on small test inputs.",
      side: "right",
    },
    {
      target: "notebook",
      title: "Wrote it on paper?",
      description: "Upload a photo of your notebook and the text is read in for you.",
      side: "bottom",
    },
    {
      target: "idea",
      title: "Explain your thinking",
      description: "Optional, but it lets the analysis spot where your reasoning and your code disagree.",
      side: "right",
    },
    {
      target: "process",
      title: "Then press Process",
      description: "Your approach is run on a few test inputs and animated step by step. It usually takes under a minute.",
      side: "top",
    },
    {
      target: "solution",
      title: "Stuck? There's a solution too",
      description:
        "It asks you to try once more first. When you do open it, it builds on your attempt and is saved, so opening it again is free.",
      side: "bottom",
    },
  ],
  // The first finished analysis.
  analysis: [
    {
      target: "verdict",
      title: "The verdict",
      description: "Whether your approach works, and how many of the test cases it passed.",
      side: "bottom",
    },
    {
      target: "cases",
      title: "Test cases",
      description: "The AI picked inputs that cover different situations. Switch between them; failing ones come first.",
      side: "bottom",
    },
    {
      target: "player",
      title: "Step through your code",
      description:
        "Play, pause, or use the arrow keys. Shift-click steps to attach them to a question in the chat.",
      side: "top",
    },
    {
      target: "tabs",
      title: "Diagnosis and hints",
      description:
        "The diagnosis explains where and why it breaks and jumps to that step. Hints nudge you without giving the answer away.",
      side: "bottom",
    },
    {
      target: "fix",
      title: "Fix this attempt",
      description: "Get a corrected version of your own approach, with what changed and why.",
      side: "bottom",
    },
    {
      target: "chat",
      title: "Ask follow-up questions",
      description: "Ask about any step or any part of the diagnosis. It won't hand you the full solution.",
      side: "top",
    },
    {
      target: "attempts",
      title: "Every run is kept",
      description: "Switch between your attempts, start a new one, share a public link to one, or delete it.",
      side: "bottom",
    },
  ],
  // The first finished solution.
  solution: [
    {
      target: "versions",
      title: "Solution versions",
      description:
        "Ask for another version (a different approach, better time or space, or your own request), share one, or delete it.",
      side: "bottom",
    },
    {
      target: "approach",
      title: "The approach",
      description: "The idea behind it, why it works, and what it costs in time and space.",
      side: "right",
    },
    {
      target: "code",
      title: "The code",
      description: "Copy it, and watch the highlighted line follow the walkthrough.",
      side: "right",
    },
    {
      target: "cases",
      title: "Test inputs",
      description: "The walkthrough was run for real on each of these inputs. Switch between them to compare.",
      side: "bottom",
    },
    {
      target: "tabs",
      title: "Two ways to read it",
      description: "The walkthrough animates the solution step by step; line by line explains each line of the code.",
      side: "bottom",
    },
    {
      target: "chat",
      title: "Ask about this solution",
      description: "Ask why a line is there, or ask for a different approach and confirm to get it as a new version.",
      side: "top",
    },
  ],
};

/**
 * Accounts from before the tours existed have no `toursSeen` and would otherwise all get them at once, so
 * they count as having seen every tour. Resetting (`toursSeen: []`) shows them again for anyone.
 */
export const TOURS_SINCE = new Date("2026-10-12T00:00:00Z");

export function toursSeenBy(user: { createdAt?: Date; preferences?: { toursSeen?: readonly TourId[] | null } | null }): TourId[] {
  const seen = user.preferences?.toursSeen;
  if (seen) return [...seen];
  return user.createdAt && user.createdAt < TOURS_SINCE ? [...TOURS] : [];
}
