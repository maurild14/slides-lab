"use client";

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
  armInsert,
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
          if (!url) throw new Error(`No se pudo subir ${file.name}`);
          setImages((prev) => [{ url, name: file.name }, ...prev]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir");
      } finally {
        setUploading(false);
      }
    },
    [onUpload]
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
        throw new Error(data.detail || data.error || "No se pudo generar");
      }
      setImages((prev) => [{ url: data.url!, name: data.url! }, ...prev]);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar");
    } finally {
      setBusy(false);
    }
  }, [prompt, busy, fullBleed, aspectRatio]);

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
      title="Imágenes"
      description="Subí, generá, o arrastrá una al slide."
      onClose={onClose}
    >
      <PanelGroup title="Subir">
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
            Soltá archivos acá — PNG, JPG o WebP.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Subiendo…" : "Elegir archivos"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => {
              acceptFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </PanelGroup>

      <PanelGroup title="Generar con IA">
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
              aria-label="Qué imagen querés generar"
              placeholder="Flecha zigzag dibujada a mano, negra…"
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
              Fondo completo ({SIZE_FOR_RATIO[aspectRatio]})
            </label>
            <Button
              variant="accent"
              onClick={handleGenerate}
              disabled={busy || !prompt.trim()}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Generando…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Generar
                </>
              )}
            </Button>
            {busy && (
              <p className="text-center text-micro text-muted-foreground">
                Tarda entre 15 y 60 segundos.
              </p>
            )}
          </div>
        ) : (
          <PanelEmpty>
            Para generar imágenes instalá el Codex CLI y ejecutá{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-micro">codex login</code>.
            Subir y arrastrar sigue andando.
          </PanelEmpty>
        )}
      </PanelGroup>

      {error && (
        <p className="mb-4 flex items-start gap-2 text-label text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <PanelGroup title="Galería">
        {images.length > 6 && (
          <div className="mb-2">
            <SearchInput
              label="Buscar en la galería"
              placeholder="Buscar por nombre…"
              value={query}
              onChange={setQuery}
            />
          </div>
        )}
        {selectedImage && (
          <p className="mb-2 flex items-center gap-1.5 text-label text-muted-foreground">
            <Replace className="h-4 w-4 shrink-0" aria-hidden />
            Hay una imagen seleccionada: usá “Reemplazar” en su tarjeta.
          </p>
        )}
        {visible.length === 0 ? (
          <PanelEmpty>
            {images.length === 0
              ? "Todavía no hay imágenes. Subí una o generala con IA."
              : `Ninguna imagen se llama “${query}”.`}
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
                  onPointerDown={(e) => armInsert(e, () => insertImage(img.url))}
                  title={`${img.name} — arrastrala o tocala`}
                  aria-label={`Insertar ${img.name}`}
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
                    aria-label={`Reemplazar la imagen seleccionada por ${img.name}`}
                    className="oc-press oc-focus absolute inset-x-1 bottom-1 cursor-pointer rounded-sm bg-foreground/85 py-1 text-micro font-medium text-background hover:bg-foreground"
                  >
                    Reemplazar
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
