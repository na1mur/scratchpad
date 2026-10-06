export const VERDICTS = ["works", "fails", "partially_works", "unclear"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Record<Verdict, string> = {
  works: "Works",
  fails: "Fails",
  partially_works: "Partially works",
  unclear: "Unclear",
};
