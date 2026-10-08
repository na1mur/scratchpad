import { Bricolage_Grotesque, Caveat } from "next/font/google";

// Scoped to the landing page so other routes don't preload them.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["wdth", "opsz"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

export const landingFonts = `${bricolage.variable} ${caveat.variable}`;
