"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { Section } from "./InspectorFields";
import { cn } from "@/lib/utils";
import type { AspectRatio } from "@/types/carousel";

interface GeneratedImage {
  url: string;
  name: string;
}

interface ImagePanelProps {
  aspectRatio: AspectRatio;
  /** False when no installed engine can generate images. */
  canGenerate: boolean;
  onDragStart: (url: string) => void;
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

export function ImagePanel({
  aspectRatio,
  canGenerate,
  onDragStart,
}: ImagePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [fullBleed, setFullBleed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);

  const loadImages = useCallback(async () => {
    try {
      const res = await fetch("/api/images");
      const data: { images?: GeneratedImage[] } = await res.json();
      setImages(data.images ?? []);
    } catch {
      // a missing gallery is not worth an error state
    }
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

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
      const data: { url?: string; error?: string; detail?: string } =
        await res.json();
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

  return (
    <Section title="Imágenes">
      {canGenerate ? (
        <>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleGenerate();
              }
            }}
            rows={3}
            disabled={busy}
            placeholder="Flecha zigzag dibujada a mano, negra…"
            className={cn(
              "w-full rounded-md border border-border bg-surface px-2 py-1.5",
              "text-xs leading-relaxed resize-none",
              "placeholder:text-muted-foreground/60",
              "focus:outline-none focus:ring-2 focus:ring-ring",
              "disabled:opacity-50"
            )}
          />

          <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={fullBleed}
              onChange={(e) => setFullBleed(e.target.checked)}
              disabled={busy}
              className="h-3 w-3 accent-[var(--accent)] cursor-pointer"
            />
            Fondo completo ({SIZE_FOR_RATIO[aspectRatio]})
          </label>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || !prompt.trim()}
            className={cn(
              "oc-press w-full h-7 rounded-md text-xs font-medium cursor-pointer",
              "bg-accent text-white transition-colors duration-150",
              "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-40",
              "flex items-center justify-center gap-1.5"
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                Generando…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" strokeWidth={2} />
                Generar
              </>
            )}
          </button>

          {busy && (
            <p className="text-[10px] text-muted-foreground text-center">
              Tarda entre 15 y 60 segundos.
            </p>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-[10px] text-destructive">
              <AlertCircle className="h-3 w-3 shrink-0 mt-px" strokeWidth={2} />
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Para generar imágenes instalá el Codex CLI y ejecutá{" "}
          <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
            codex login
          </code>
          . Igual podés arrastrar las que ya subiste.
        </p>
      )}

      {images.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] text-muted-foreground mb-1.5">
            Arrastrá una al slide, o tocala para centrarla.
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {busy && (
              <div className="aspect-square rounded-md border border-border bg-muted animate-pulse" />
            )}
            {images.map((img) => (
              <button
                key={img.url}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onDragStart(img.url);
                }}
                title={img.name}
                aria-label={`Insertar ${img.name}`}
                className={cn(
                  "aspect-square rounded-md overflow-hidden cursor-grab active:cursor-grabbing",
                  "border border-border transition-colors duration-150",
                  "hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
                style={ALPHA_BG}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-contain pointer-events-none"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
