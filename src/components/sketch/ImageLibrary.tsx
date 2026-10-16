"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlusIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LIBRARY_IMAGE_TYPES, MAX_LIBRARY_IMAGE_BYTES, type LibraryImage } from "@/lib/sketch/images";
import { cn } from "@/lib/utils";
import { LIBRARY_IMAGE_MIME, loadLibrary, placeImage, removeImage, uploadImages, useImageLibrary } from "./libraryStore";
import type { SketchStore } from "./store";

const ACCEPT = LIBRARY_IMAGE_TYPES.join(",");

function Tile({ store, image, onDelete }: { store: SketchStore; image: LibraryImage; onDelete: () => void }) {
  return (
    <li className="group/tile relative">
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(LIBRARY_IMAGE_MIME, image.id);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => placeImage(store, image)}
        title={`${image.name}. Click to add, or drag onto the canvas.`}
        className="flex w-full cursor-grab flex-col gap-1 rounded-md p-1 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none active:cursor-grabbing"
      >
        <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded border bg-paper">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file of the learner's; next/image can't load it */}
          <img src={image.url} alt="" draggable={false} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
        </span>
        <span className="truncate px-0.5 text-[11px] text-muted-foreground">
          <span className="sr-only">Add </span>
          {image.name}
        </span>
      </button>
      <Button
        variant="secondary"
        size="icon-xs"
        aria-label={`Delete ${image.name} from the library`}
        title="Delete from the library"
        className="absolute top-2 right-2 opacity-0 shadow-sm group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </li>
  );
}

/**
 * The learner's personal picture library, in the sidebar: pictures uploaded once (a button, or files dropped on
 * the panel or the canvas) and kept in their account, so any sketch can use them. Click one to add it to the
 * middle of the view, or drag it to where it should go.
 */
export function ImageLibrary({ store }: { store: SketchStore }) {
  const lib = useImageLibrary();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [deleting, setDeleting] = useState<LibraryImage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadLibrary();
  }, []);

  const pick = (files: FileList | File[] | null) => {
    const list = files ? [...files] : [];
    if (list.length) void uploadImages(list);
  };
  const full = lib.images.length >= lib.limit;

  return (
    <section
      aria-label="Image library"
      className={cn("flex min-h-full flex-col gap-3 rounded-md", over && "bg-brand-soft/60 ring-2 ring-brand ring-inset")}
      onDragOver={(e) => {
        if (!lib.enabled || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        if (!lib.enabled || !e.dataTransfer.files.length) return;
        e.preventDefault();
        pick(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-medium text-muted-foreground">
          Your images{lib.status === "ready" ? ` (${lib.images.length}/${lib.limit})` : ""}
        </h2>
        <Button
          variant="soft"
          size="xs"
          disabled={!lib.enabled || full}
          title={full ? `The library holds up to ${lib.limit} images` : "PNG, JPG or WebP, up to 4 MB each"}
          onClick={() => input.current?.click()}
        >
          {lib.uploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Upload
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose pictures to upload"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {!lib.enabled ? (
        <p className="px-1 text-xs text-muted-foreground text-pretty">Picture uploads aren&apos;t set up on this server.</p>
      ) : lib.status === "loading" || lib.status === "idle" ? (
        <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground" role="status">
          <Loader2Icon className="size-3.5 animate-spin" /> Loading your images…
        </p>
      ) : lib.status === "error" ? (
        <div className="flex flex-col items-start gap-2 px-1" role="alert">
          <p className="text-xs text-destructive">Your images couldn&apos;t be loaded.</p>
          <Button variant="outline" size="xs" onClick={() => void loadLibrary(true)}>
            Try again
          </Button>
        </div>
      ) : lib.images.length === 0 ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <ImagePlusIcon className="size-6 text-brand-strong" aria-hidden />
          <span className="text-pretty">
            Upload pictures once and use them in any sketch. Drop files here, or click to choose. PNG, JPG or WebP, up to{" "}
            {MAX_LIBRARY_IMAGE_BYTES / 1024 / 1024} MB.
          </span>
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-1">
          {lib.images.map((image) => (
            <Tile key={image.id} store={store} image={image} onDelete={() => setDeleting(image)} />
          ))}
        </ul>
      )}

      <p className="mt-auto px-1 text-[11px] leading-4 text-muted-foreground text-pretty">
        Click a picture to add it, or drag it onto the canvas. You can also drop picture files straight onto the canvas.
      </p>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && !busy && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this image?</DialogTitle>
            <DialogDescription>
              {deleting?.name ? `“${deleting.name}” will be removed from your library. ` : ""}Sketches that already use it will show a
              missing-image box instead. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!deleting) return;
                setBusy(true);
                await removeImage(deleting.id);
                setBusy(false);
                setDeleting(null);
              }}
            >
              {busy && <Loader2Icon className="animate-spin" />} Delete image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
