"use client";

import { useEffect, useState } from "react";
import { ArrowUpIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

// Appears bottom-right once the reader is more than a screen below the top.
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <button
      type="button"
      aria-label="Scroll to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        buttonVariants({ variant: "outline", size: "icon-lg" }),
        "fixed right-4 bottom-4 z-50 rounded-full bg-paper shadow-md transition-[opacity,translate,scale] duration-300 ease-out sm:right-6 sm:bottom-6",
        visible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-90 opacity-0",
      )}
    >
      <ArrowUpIcon />
    </button>
  );
}
