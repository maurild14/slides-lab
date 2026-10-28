"use client";

import { useState, useCallback, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useT } from "@/components/locale-provider";
import type { ReferenceImage } from "@/types/carousel";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface ReferenceImagesProps {
  carouselId: string;
  images: ReferenceImage[];
  onImagesChange: () => void;
}

export function ReferenceImages({
  carouselId,
  images,
  onImagesChange,
}: ReferenceImagesProps) {
  const t = useT();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<ReferenceImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      // One canned "must be a PNG…" used to cover every failure, so an
      // oversized file, a Sharp crash and a 404 on the carousel all read as
      // "wrong format". Each step says what actually went wrong.
      if (file.size > MAX_FILE_SIZE) {
        setError(
          t("“{name}” is {size} MB. The maximum is 20 MB.", { name: file.name, size: (file.size / 1024 / 1024).toFixed(1) })
        );
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          setError(
            uploadRes.status === 400
              ? t("Couldn't upload “{name}”. It must be a PNG, JPG, JPEG or WebP.", { name: file.name })
              : t("The server couldn't process “{name}” (error {status}).", { name: file.name, status: uploadRes.status })
          );
          return;
        }
        const uploadData = await uploadRes.json();

        const res = await fetch(`/api/carousels/${carouselId}/references`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: uploadData.url, name: file.name }),
        });
        if (!res.ok) {
          setError(
            t("The image was uploaded but couldn't be added to the carousel. Try again.")
          );
          return;
        }
        onImagesChange();
      } catch {
        setError(t("Couldn't upload the image. Check the connection and try again."));
      } finally {
        setUploading(false);
      }
    },
    [carouselId, onImagesChange, t]
  );

  const handleRemove = useCallback(
    async (imageId: string) => {
      setError(null);
      const res = await fetch(
        `/api/carousels/${carouselId}/references?imageId=${imageId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setError(t("Couldn't remove the image. Try again."));
        return;
      }
      onImagesChange();
    },
    [carouselId, onImagesChange, t]
  );

  const pick = () => fileRef.current?.click();

  return (
    <div className="border-b border-border">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleUpload(file);
        }}
      />

      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-label font-medium text-muted-foreground">
          {t("Reference images")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={pick}
          disabled={uploading}
          className="gap-1 px-2"
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          {uploading ? t("Uploading…") : t("Add")}
        </Button>
      </div>

      {images.length === 0 ? (
        <button
          type="button"
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const file = e.dataTransfer.files[0];
            // Dropping a file with an empty `file.type` (common on Windows)
            // used to do nothing at all; let handleUpload report the reason.
            if (file) handleUpload(file);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onClick={pick}
          className={cn(
            "oc-focus mx-4 mb-3 flex w-[calc(100%-2rem)] cursor-pointer flex-col items-center gap-0.5 rounded-lg border border-dashed p-3 text-center transition-colors",
            over ? "border-accent bg-accent-soft" : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
          )}
        >
          <ImagePlus className="mb-1 h-4 w-4 text-muted-foreground/60" aria-hidden />
          <span className="text-label text-foreground">
            {t("Drag your reference images here")}
          </span>
          <span className="text-micro text-muted-foreground">
            {t("The AI looks at them to match your style")}
          </span>
        </button>
      ) : (
        <ul className="flex list-none gap-2 overflow-x-auto px-4 pb-3">
          {images.map((img) => (
            <li key={img.id} className="oc-enter-pop relative shrink-0">
              <button
                type="button"
                onClick={() => setPreview(img)}
                aria-label={t("View {name} larger", { name: img.name })}
                className="oc-focus block h-16 w-16 cursor-pointer overflow-hidden rounded-lg border border-border transition-colors hover:border-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.name}
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={() => handleRemove(img.id)}
                className="oc-focus absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-surface bg-destructive text-white shadow-rest"
                aria-label={t("Remove {name}", { name: img.name })}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
          <li className="shrink-0">
            <button
              type="button"
              onClick={pick}
              aria-label={t("Add another reference image")}
              className="oc-focus flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border transition-colors hover:border-muted-foreground/50"
            >
              <ImagePlus className="h-4 w-4 text-muted-foreground" aria-hidden />
            </button>
          </li>
        </ul>
      )}

      {error && (
        <p role="alert" className="px-4 pb-3 text-micro text-destructive">
          {error}
        </p>
      )}

      {/* Same modal shell as the rest of the app — this used to be a hand-rolled
          overlay with no focus trap and no Escape handling. */}
      <DialogShell
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
        title={preview?.name ?? ""}
        className="max-w-2xl"
      >
        {preview && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview.url}
            alt={preview.name}
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        )}
      </DialogShell>
    </div>
  );
}
