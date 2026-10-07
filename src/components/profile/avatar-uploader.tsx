"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUpIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { LoadingButton } from "@/components/loading-button";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/fetcher";
import { IMAGE_MIME_TYPES } from "@/lib/schemas/attempts";
import { MAX_IMAGE_BYTES } from "@/lib/schemas/uploads";
import { squareImageBlob } from "@/lib/square-image";

type Busy = "upload" | "remove" | null;

/**
 * Profile photo with upload and remove. The picked image is square-cropped and
 * shrunk in the browser and posted to our API, which stores it in R2 (so the
 * bucket needs no CORS rules), swaps it in and deletes the old one.
 */
export function AvatarUploader({
  avatarUrl,
  hasUpload,
  hasGoogle,
  uploadsEnabled,
}: {
  avatarUrl: string | null;
  /** The current photo is one the user uploaded (as opposed to Google's or none). */
  hasUpload: boolean;
  hasGoogle: boolean;
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Busy>(null);

  async function upload(file: File) {
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Only PNG, JPG or WebP images.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("That image is over 8 MB.");
      return;
    }
    setBusy("upload");
    try {
      const blob = await squareImageBlob(file);
      const form = new FormData();
      form.append("file", blob, "avatar");
      await api("/api/settings/avatar", { method: "POST", body: form });
      toast.success("Profile photo updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload your photo.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      await api("/api/settings/avatar", { method: "DELETE" });
      toast.success(hasGoogle ? "Using your Google photo again" : "Profile photo removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove your photo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar src={avatarUrl} className="size-20" iconClassName="size-8" />
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap gap-2">
          <LoadingButton
            type="button"
            variant="outline"
            size="sm"
            icon={<ImageUpIcon />}
            loading={busy === "upload"}
            disabled={!uploadsEnabled || busy !== null}
            onClick={() => input.current?.click()}
          >
            {busy === "upload" ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
          </LoadingButton>
          {hasUpload && (
            <LoadingButton
              type="button"
              variant="ghost"
              size="sm"
              icon={<Trash2Icon />}
              loading={busy === "remove"}
              disabled={busy !== null}
              onClick={remove}
            >
              {busy === "remove" ? "Removing…" : hasGoogle ? "Use Google photo" : "Remove"}
            </LoadingButton>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {uploadsEnabled
            ? "PNG, JPG or WebP. It's cropped to a square."
            : "Photo uploads aren't configured on this server."}
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_MIME_TYPES.join(",")}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
