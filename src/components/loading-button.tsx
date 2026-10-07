import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A Button that is disabled and shows a spinner while `loading`. The
 * spinner replaces the leading icon so the label doesn't jump.
 */
export function LoadingButton({
  loading,
  icon,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { loading?: boolean; icon?: React.ReactNode }) {
  return (
    <Button disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2Icon className="animate-spin" /> : icon}
      {children}
    </Button>
  );
}
