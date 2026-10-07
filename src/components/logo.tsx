import Image from "next/image";
import Link from "next/link";
import { cn } from "cn";

const RATIO = { light: 1000 / 200, dark: 912 / 273 };

type LogoProps = {
  /** Rendered height in px; width follows each artwork's aspect ratio. */
  height?: number;
  /** Wraps the logo in a link to this path. */
  href?: string;
  /** Load eagerly, for logos above the fold. */
  priority?: boolean;
  className?: string;
};

/** Scratchpad wordmark; swaps between the light and dark artwork with the theme. */
export function Logo({ height = 32, href, priority, className }: LogoProps) {
  const image = (variant: "light" | "dark") => (
    <Image
      src={`/logo-${variant}.png`}
      alt={variant === "light" ? "Scratchpad" : ""}
      aria-hidden={variant === "dark" || undefined}
      width={Math.round(height * RATIO[variant])}
      height={height}
      priority={priority}
      className={variant === "light" ? "dark:hidden" : "hidden dark:block"}
    />
  );
  const content = (
    <>
      {image("light")}
      {image("dark")}
    </>
  );
  const classes = cn("inline-flex shrink-0 items-center", className);

  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
