"use client";

import { useT } from "@/components/locale-provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Replace, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DROP_WIDTH_RATIO } from "@/lib/canvas-utils";
import type { DragPayload } from "@/lib/slide-elements";
import {
  PanelEmpty,
  PanelGroup,
  PanelShell,
  SearchInput,
  insertProps,
} from "./panel-kit";
import type { AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

interface GalleryImage {
  url: string;
  name: string;
}

/** Slide-shaped sizes plus the square that suits overlays. */
const SIZE_FOR_RATIO: Record<AspectRatio, string> = {
  "1:1": "1080x1080",
  "4:5": "1080x1350",
  "9:16": "1080x1920",
};

// Checkerboard so a transparent PNG reads as transparent, not as white.
const ALPHA_BG = {
  backgroundImage:
    "linear-gradient(45deg, var(--muted) 25%, transparent 25%), linear-gradient(-45deg, var(--muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--muted) 75%), linear-gradient(-45deg, transparent 75%, var(--muted) 75%)",
  backgroundSize: "10px 10px",
  backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0px",
};

interface Props {
  onClose: () => void;
  onInsert: (payload: DragPayload) => void;
  aspectRatio: AspectRatio;
  /** False when no installed engine can generate images. */
  canGenerate: boolean;
  onUpload: (file: File) => Promise<string | null>;
  /** The selected element, when it is an image that can be swapped in place. */
  selectedImage: HTMLImageElement | null;
  onReplace: (url: string) => void;
}

export function ImagesPanel({
  onClose,
  onInsert,
  aspectRatio,
  canGenerate,
  onUpload,
  selectedImage,
  onReplace,
}: Props) {
  const t = useT();
  const [prompt, setPrompt] = useState("");
  const [fullBleed, setFullBleed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadImages = useCallback(async () => {
    try {
      const res = await fetch("/api/images");
      const data: { images?: GalleryImage[] } = await res.json();
      setImages(data.images ?? []);
    } catch {
      // a missing gallery is not worth an error state
    }
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  const acceptFiles = useCallback(
    async (files: FileList | File[] | null) => {
      const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        for (const file of list) {
          const url = await onUpload(file);
          if (!url) throw new Error(t("Couldn't upload {name}", { name: file.name }));
          setImages((prev) => [{ url, name: file.name }, ...prev]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Couldn't upload"));
      } finally {
        setUploading(false);
      }
    },
    [onUpload, t]
  );

  const handleGenerate = useCallback(async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          size: fullBleed ? SIZE_FOR_RATIO[aspectRatio] : "1024x1024",
          transparent: !fullBleed,
        }),
      });
      const data: { url?: string; error?: string; detail?: string } = await res.json();
      if (!res.ok || !data.url) {
        // The route's own messages are English; stderr in `detail` stays raw.
        throw new Error(data.detail || t(data.error || "Couldn't generate"));
      }
      setImages((prev) => [{ url: data.url!, name: data.url! }, ...prev]);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Couldn't generate"));
    } finally {
      setBusy(false);
    }
  }, [prompt, busy, fullBleed, aspectRatio, t]);

  const { width: slideW } = DIMENSIONS[aspectRatio];
  const dropWidth = Math.round(slideW * DROP_WIDTH_RATIO);

  const insertImage = (url: string) =>
    onInsert({
      html: `<img src="${url}" alt="" style="width:${dropWidth}px;height:auto">`,
      width: dropWidth,
      height: dropWidth,
      previewUrl: url,
    });

  const q = query.trim().toLowerCase();
  const visible = q ? images.filter((i) => i.name.toLowerCase().includes(q)) : images;

  return (
    <PanelShell
      title={t("Images")}
      description={t("Upload, generate, or drag one onto the slide.")}
      onClose={onClose}
    >
      <PanelGroup title={t("Upload")}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            acceptFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors duration-150",
            dropping ? "border-accent bg-accent-soft" : "border-border bg-muted/40"
          )}
        >
          <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-label text-muted-foreground">
            {t("Drop files here — PNG, JPG or WebP.")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? t("Uploading…") : t("Choose files")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            multiple
            hidden
            onChange={(e) => {
              acceptFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </PanelGroup>

      <PanelGroup title={t("Generate with AI")}>
        {canGenerate ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate();
              }}
              rows={3}
              disabled={busy}
              aria-label={t("What image do you want to generate")}
              placeholder={t("Hand-drawn zigzag arrow, black…")}
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-body leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)] disabled:opacity-50"
            />
            <label className="flex cursor-pointer items-center gap-2 text-label text-muted-foreground">
              <input
                type="checkbox"
                checked={fullBleed}
                onChange={(e) => setFullBleed(e.target.checked)}
                disabled={busy}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
              {t("Full background ({size})", { size: SIZE_FOR_RATIO[aspectRatio] })}
            </label>
            <Button
              variant="accent"
              onClick={handleGenerate}
              disabled={busy || !prompt.trim()}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("Generating…")}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  {t("Generate")}
                </>
              )}
            </Button>
            {busy && (
              <p className="text-center text-micro text-muted-foreground">
                {t("Takes between 15 and 60 seconds.")}
              </p>
            )}
          </div>
        ) : (
          <PanelEmpty>
            {t("To generate images, install the Codex CLI and run")}{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-micro">codex login</code>.
            {t("Uploading and dragging still work.")}
          </PanelEmpty>
        )}
      </PanelGroup>

      {error && (
        <p className="mb-4 flex items-start gap-2 text-label text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <PanelGroup title={t("Gallery")}>
        {images.length > 6 && (
          <div className="mb-2">
            <SearchInput
              label={t("Search the gallery")}
              placeholder={t("Search by name…")}
              value={query}
              onChange={setQuery}
            />
          </div>
        )}
        {selectedImage && (
          <p className="mb-2 flex items-center gap-1.5 text-label text-muted-foreground">
            <Replace className="h-4 w-4 shrink-0" aria-hidden />
            {t("An image is selected: use “Replace” on its card.")}
          </p>
        )}
        {visible.length === 0 ? (
          <PanelEmpty>
            {images.length === 0
              ? t("No images yet. Upload one or generate it with AI.")
              : t("No image is called “{query}”.", { query })}
          </PanelEmpty>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(busy || uploading) && (
              <div className="aspect-square animate-pulse rounded-md border border-border bg-muted" />
            )}
            {visible.map((img) => (
              <div key={img.url} className="relative">
                <button
                  type="button"
                  {...insertProps(() => insertImage(img.url))}
                  title={t("{label} — drag it or click it", { label: img.name })}
                  aria-label={t("Insert {label}", { label: img.name })}
                  className="oc-press oc-focus block aspect-square w-full cursor-grab overflow-hidden rounded-md border border-border hover:border-accent active:cursor-grabbing"
                  style={ALPHA_BG}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt=""
                    draggable={false}
                    className="pointer-events-none h-full w-full object-contain"
                  />
                </button>
                {selectedImage && (
                  <button
                    type="button"
                    onClick={() => onReplace(img.url)}
                    aria-label={t("Replace the selected image with {name}", { name: img.name })}
                    className="oc-press oc-focus absolute inset-x-1 bottom-1 cursor-pointer rounded-sm bg-foreground/85 py-1 text-micro font-medium text-background hover:bg-foreground"
                  >
                    {t("Replace")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </PanelGroup>
    </PanelShell>
  );
}
