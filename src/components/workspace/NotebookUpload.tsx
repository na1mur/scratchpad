"use client";

import { useRef, useState } from "react";
import { ImageUpIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/fetcher";
import { IMAGE_MIME_TYPES } from "@/lib/schemas/attempts";
import { MAX_IMAGE_BYTES } from "@/lib/schemas/uploads";

export type UploadedImage = {
  r2Key: string;
  mimeType: (typeof IMAGE_MIME_TYPES)[number];
  extractedText?: string;
};

const MAX_IMAGES = 4;

/**
 * Notebook photos: posted to our API, which stores them in R2 and then
 * transcribes them right away. The transcription is handed back through
 * `onExtracted` for the learner to review; nothing is submitted automatically.
 * Returns the header button and the thumbnail strip separately so they can sit
 * in different places.
 */
export function useNotebookUpload({
  problemId,
  images,
  onChange,
  onExtracted,
  disabled,
}: {
  problemId: string;
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  onExtracted: (result: { pseudoCode: string; notes: string }) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"uploading" | "reading" | null>(null);

  async function addFiles(files: FileList) {
    const list = Array.from(files).slice(0, MAX_IMAGES - images.length);
    if (files.length > list.length) toast.error(`You can attach up to ${MAX_IMAGES} photos.`);
    let next = images;
    for (const file of list) {
      if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
        toast.error(`${file.name}: only PNG, JPG or WebP images.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is over 8 MB.`);
        continue;
      }
      let image: UploadedImage;
      setBusy("uploading");
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("problemId", problemId);
        const { key } = await api<{ key: string }>("/api/uploads/file", { method: "POST", body });
        image = { r2Key: key, mimeType: file.type as UploadedImage["mimeType"] };
        setPreviews((p) => ({ ...p, [key]: URL.createObjectURL(file) }));
        next = [...next, image];
        onChange(next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
        continue;
      }
      setBusy("reading");
      try {
        const result = await api<{ pseudoCode: string; notes: string }>("/api/uploads/extract", {
          method: "POST",
          body: { problemId, r2Key: image.r2Key, mimeType: image.mimeType },
        });
        next = next.map((i) => (i.r2Key === image.r2Key ? { ...i, extractedText: result.pseudoCode } : i));
        onChange(next);
        onExtracted(result);
        toast.success("Transcribed. Check it against your notebook before processing.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't read that image.");
      }
    }
    setBusy(null);
  }

  const full = images.length >= MAX_IMAGES;

  const button = (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Upload a notebook photo"
              disabled={disabled || full || busy !== null}
              onClick={() => input.current?.click()}
            />
          }
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <ImageUpIcon />}
        </TooltipTrigger>
        <TooltipContent className="max-w-64 flex-col items-start gap-1 text-left">
          {busy === "uploading" ? (
            "Uploading your photo…"
          ) : busy === "reading" ? (
            "Reading your handwriting…"
          ) : full ? (
            `You've attached the maximum of ${MAX_IMAGES} photos.`
          ) : (
            <>
              <span className="font-medium">Upload a photo of your notebook</span>
              <span>
                We&apos;ll turn the handwriting into text and put the code in Pseudo-code. Any idea or explanation we
                find goes into Idea / explanation.
              </span>
            </>
          )}
        </TooltipContent>
      </Tooltip>
      <input
        ref={input}
        type="file"
        accept={IMAGE_MIME_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );

  const thumbnails =
    images.length > 0 ? (
      <ul className="flex flex-wrap gap-2">
        {images.map((img) => (
          <li key={img.r2Key} className="relative size-14 overflow-hidden rounded-md border bg-muted/30">
            {previews[img.r2Key] ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={previews[img.r2Key]} alt="Notebook page" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-muted-foreground">image</div>
            )}
            <Button
              type="button"
              size="icon-xs"
              variant="secondary"
              className="absolute top-0.5 right-0.5 size-4 rounded-full"
              aria-label="Remove photo"
              disabled={disabled || busy !== null}
              onClick={() => onChange(images.filter((i) => i.r2Key !== img.r2Key))}
            >
              <XIcon className="size-3" />
            </Button>
          </li>
        ))}
      </ul>
    ) : null;

  return { button, thumbnails };
}
