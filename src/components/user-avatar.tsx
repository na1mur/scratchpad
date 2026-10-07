import { UserIcon } from "lucide-react";
import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** The user's photo, or the generic user icon when there is none or it fails to load. */
export function UserAvatar({
  src,
  size,
  className,
  iconClassName,
}: {
  src: string | null;
  size?: React.ComponentProps<typeof Avatar>["size"];
  className?: string;
  iconClassName?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {/* Google's image host rejects some requests that carry a Referer. */}
      {src && <AvatarImage src={src} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback>
        <UserIcon className={cn("size-4 group-data-[size=sm]/avatar:size-3.5", iconClassName)} />
      </AvatarFallback>
    </Avatar>
  );
}
