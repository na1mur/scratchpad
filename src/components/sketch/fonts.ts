import { Caveat } from "next/font/google";

// The landing page's handwriting font, for the sketch's "hand" font family (lib/sketch/style.ts FONT_CSS).
// Loaded here rather than from the landing fonts so the sketch page doesn't preload Bricolage too.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

export const sketchFonts = caveat.variable;
