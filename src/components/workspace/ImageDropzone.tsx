"use client";

import { useRef, useState } from "react";
import { ImageUpIcon, Loader2Icon, ScanTextIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
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
 * Notebook photos: posted to our API, which stores them in R2, then
 * transcribed on request. The transcription is handed back to the editor
 * for review; nothing is submitted automatically.
 */
export function ImageDropzone({
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
  const [uploading, setUploading] = useState(0);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).slice(0, MAX_IMAGES - images.length);
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
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("problemId", problemId);
        const { key } = await api<{ key: string }>("/api/uploads/file", { method: "POST", body: form });
        setPreviews((p) => ({ ...p, [key]: URL.createObjectURL(file) }));
        next = [...next, { r2Key: key, mimeType: file.type as UploadedImage["mimeType"] }];
        onChange(next);
        toast.success("Photo uploaded. Press Extract text to transcribe it.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function extract(img: UploadedImage) {
    setExtracting(img.r2Key);
    try {
      const result = await api<{ pseudoCode: string; notes: string }>("/api/uploads/extract", {
        method: "POST",
        body: { problemId, r2Key: img.r2Key, mimeType: img.mimeType },
      });
      onChange(images.map((i) => (i.r2Key === img.r2Key ? { ...i, extractedText: result.pseudoCode } : i)));
      onExtracted(result);
      toast.success("Transcribed. Check it against your notebook before processing.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that image.");
    } finally {
      setExtracting(null);
    }
  }

  const full = images.length >= MAX_IMAGES;

  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {images.map((img) => (
            <li key={img.r2Key} className="group relative overflow-hidden rounded-lg border bg-muted/30">
              {previews[img.r2Key] ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img src={previews[img.r2Key]} alt="Notebook page" className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center text-xs text-muted-foreground">image</div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-background/85 p-1 backdrop-blur">
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  className="flex-1"
                  disabled={disabled || extracting !== null}
                  onClick={() => extract(img)}
                >
                  {extracting === img.r2Key ? <Loader2Icon className="animate-spin" /> : <ScanTextIcon />}
                  {img.extractedText ? "Extract again" : "Extract text"}
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Remove image"
                  disabled={disabled}
                  onClick={() => onChange(images.filter((i) => i.r2Key !== img.r2Key))}
                >
                  <XIcon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) void upload(e.dataTransfer.files);
          }}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50",
            dragging && "border-primary bg-muted/50",
          )}
        >
          {uploading > 0 ? <Loader2Icon className="size-4 animate-spin" /> : <ImageUpIcon className="size-4" />}
          {uploading > 0 ? "Uploading…" : "Drop a notebook photo, or click to upload"}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={IMAGE_MIME_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
