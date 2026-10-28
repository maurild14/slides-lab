"use client";

import { useT } from "@/components/locale-provider";
import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { SlideRenderer } from "./SlideRenderer";
import { SafeZoneOverlay } from "./SafeZoneOverlay";
import type { Slide, AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

interface CarouselPreviewProps {
  slides: Slide[];
  aspectRatio: AspectRatio;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  showSafeZones?: boolean;
  /** The area the canvas overlay is clipped to. */
  viewportRef: React.RefObject<HTMLDivElement | null>;
  scale?: number;
  pan: { x: number; y: number };
  onFitScale: (fit: number) => void;
  onIframeReady?: (iframe: HTMLIFrameElement) => void;
  /** True while the AI is rewriting this slide. */
  generating?: boolean;
}

export function CarouselPreview({
  slides,
  aspectRatio,
  activeIndex,
  onActiveChange,
  showSafeZones = false,
  viewportRef,
  scale,
  pan,
  onFitScale,
  onIframeReady,
  generating = false,
}: CarouselPreviewProps) {
  const t = useT();
  const slide = slides[activeIndex];

  // The guides have to sit on the slide, not on the grey work area. They used
  // to be `inset-0` over the whole viewport, so "safe zone" was drawn around
  // the window and lined up with nothing.
  const [fit, setFit] = useState(0);
  const handleFitScale = useCallback(
    (value: number) => {
      setFit(value);
      onFitScale(value);
    },
    [onFitScale]
  );
  const { width: slideW, height: slideH } = DIMENSIONS[aspectRatio];
  const shown = scale && scale > 0 ? scale : fit;

  if (!slide) {
    return (
      <div className="flex flex-1 items-center justify-center bg-(--canvas-bg)">
        <div className="max-w-xs p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-20 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30">
            <span className="text-display opacity-30">+</span>
          </div>
          <p className="text-title font-semibold">{t("No slides yet")}</p>
          <p className="mt-1.5 text-body text-muted-foreground">
            {t("Ask the assistant for the first one from the chat, then edit it right here.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-(--canvas-bg)">
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden">
        <SlideRenderer
          key={slide.id}
          html={slide.html}
          aspectRatio={aspectRatio}
          // Keep the document readable during generation; SlideCanvas and the
          // panels already disable mutations while this slide is locked.
          interactive
          scale={scale}
          pan={pan}
          onFitScale={handleFitScale}
          onIframeReady={onIframeReady}
          style={{ position: "absolute", inset: 0 }}
        />

        {/* Same centring and pan as SlideRenderer's own box, so the guides
            track the slide through every zoom and drag. */}
        {showSafeZones && shown > 0 && (
          <div
            className="pointer-events-none absolute z-(--z-overlay)"
            style={{
              left: "50%",
              top: "50%",
              width: slideW * shown,
              height: slideH * shown,
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            <SafeZoneOverlay aspectRatio={aspectRatio} />
          </div>
        )}

        {generating && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-foreground/5 pt-6">
            <span className="oc-fade flex items-center gap-2 rounded-full bg-foreground px-3.5 py-2 text-label font-medium text-background shadow-float">
              <Sparkles className="h-4 w-4 animate-pulse" aria-hidden />
              {t("The AI is writing this slide")}
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <IconButton
            label={t("Previous slide")}
            variant="outline"
            className="pointer-events-auto bg-surface/95 shadow-raised"
            onClick={() => onActiveChange(activeIndex - 1)}
            disabled={activeIndex <= 0}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <IconButton
            label={t("Next slide")}
            variant="outline"
            className="pointer-events-auto bg-surface/95 shadow-raised"
            onClick={() => onActiveChange(activeIndex + 1)}
            disabled={activeIndex >= slides.length - 1}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
      </div>

      {slides.length > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 pb-3 pt-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => onActiveChange(i)}
              className={`oc-focus h-2 cursor-pointer rounded-full transition-[width,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                i === activeIndex
                  ? "w-6 bg-accent"
                  : "w-2 bg-foreground/20 hover:bg-foreground/40"
              }`}
              aria-label={t("Go to slide {n}", { n: i + 1 })}
              aria-current={i === activeIndex}
            />
          ))}
          <span className="ml-2 text-label tabular-nums text-muted-foreground">
            {activeIndex + 1}/{slides.length}
          </span>
        </div>
      )}
    </div>
  );
}
