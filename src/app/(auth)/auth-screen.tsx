import { cn } from "cn";
import { GraphBackdrop } from "@/components/landing/graph-backdrop";
import { AuthSpecimen, type SpecimenName } from "./auth-specimen";

/**
 * One auth page: the form in one half and a problem-solving trace in the other, split 50/50 from `lg` up.
 * On phones the design is hidden and the form is centred in the screen.
 */
export function AuthScreen({
  specimen,
  seed,
  designSide,
  children,
}: {
  specimen: SpecimenName;
  /** Seeds the shaded squares so each page's graph paper differs. */
  seed: number;
  designSide: "left" | "right";
  children: React.ReactNode;
}) {
  const designLeft = designSide === "left";
  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main
        className={cn(
          "relative isolate flex flex-1 flex-col justify-center px-5 pt-[calc(4.25rem+1.5rem)] pb-12 sm:px-10 lg:py-14",
          designLeft && "lg:order-2",
        )}
      >
        {/* On phones the side panel is hidden, so a little graph paper stays behind the form. */}
        <GraphBackdrop seed={seed} fade="down" className="absolute inset-x-0 top-0 -z-10 h-72 lg:hidden" />
        <div className="mx-auto w-full max-w-[26rem]">{children}</div>
      </main>
      <aside
        aria-hidden
        className={cn(
          "relative hidden items-center justify-center overflow-hidden border-ink/10 px-10 lg:flex",
          designLeft ? "border-r lg:order-1" : "border-l",
        )}
      >
        <GraphBackdrop seed={seed} fade="none" className="absolute inset-0" />
        <div className="relative flex w-full justify-center">
          <AuthSpecimen name={specimen} />
        </div>
      </aside>
    </div>
  );
}
