"use client";

import type { ReactNode } from "react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";

/** Honours the visitor's reduced-motion setting for every animation on the landing page. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** The highlighter swipe, drawn left to right once the phrase scrolls into view. */
export function Highlight({ children, delay = 0.3 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      className="highlight"
      style={{ backgroundRepeat: "no-repeat", backgroundPosition: "left" }}
      initial={reduced ? false : { backgroundSize: "0% 100%" }}
      whileInView={{ backgroundSize: "100% 100%" }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 1.2, delay, ease: [0.65, 0, 0.35, 1] }}
    >
      {children}
    </motion.span>
  );
}

type HeadlinePart = string | { highlight: string };

/** A headline that fades in one word at a time; the highlighted word's swipe draws once it is there. */
export function WordHeading({
  parts,
  className,
  step = 0.15,
}: {
  parts: HeadlinePart[];
  className?: string;
  step?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <h1 className={className}>
      {parts.map((part, i) => {
        const text = typeof part === "string" ? part : part.highlight;
        return (
          <span key={i}>
            {i > 0 && " "}
            <motion.span
              className="inline-block"
              initial={reduced ? false : { opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.8, delay: i * step, ease: "easeOut" }}
            >
              {typeof part === "string" ? text : <Highlight delay={i * step + 0.7}>{text}</Highlight>}
            </motion.span>
          </span>
        );
      })}
    </h1>
  );
}
