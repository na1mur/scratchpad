/**
 * What an attempt run has produced so far, shown under the progress stepper while it works. The pipeline
 * sends the whole snapshot on every change (it's small) and stores it on the attempt so a reload sees it too.
 * Holds only what the finished result shows anyway: never the suspected issue or an unchecked diagnosis.
 */
export type ProgressCase = {
  id: string;
  label: string;
  description: string;
  expected: string;
  /** `running`: in the sandbox; `explaining`: ran, being narrated; `simulating`: traced by the model by hand. */
  state: "pending" | "running" | "explaining" | "simulating" | "done";
  actual?: string;
  steps?: number;
};

export type RunProgress = {
  /** The learner's approach as the model understood it. */
  approach?: string;
  cases?: ProgressCase[];
  /** The completed code the cases run on; `retrying` while a broken translation is redone. */
  program?: { lines: number; added: number; retrying?: boolean };
  /** No runnable program, so the cases are traced by hand. */
  simulating?: boolean;
  /** The check that the hints don't give the answer away. */
  check?: "checking" | "rewording" | "done";
};
