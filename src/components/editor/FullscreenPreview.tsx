"use client";

import { useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { SlideRenderer } from "./SlideRenderer";
import { cn } from "@/lib/utils";
import type { Slide, AspectRatio } from "@/types/carousel";

interface FullscreenPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slides: Slide[];
  aspectRatio: AspectRatio;
  activeIndex: number;
  onActiveChange: (index: number) => void;
}

/** Light-on-dark chrome: the whole overlay is black, so the app's surface
 *  tokens would read as blocks of white sitting on the slide. */
const CHROME =
  "border-white/15 bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white disabled:opacity-30";

export function FullscreenPreview({
  open,
  onOpenChange,
  slides,
  aspectRatio,
  activeIndex,
  onActiveChange,
}: FullscreenPreviewProps) {
  const slide = slides[activeIndex];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && activeIndex > 0) {
        onActiveChange(activeIndex - 1);
      } else if (e.key === "ArrowRight" && activeIndex < slides.length - 1) {
        onActiveChange(activeIndex + 1);
      }
    },
    [activeIndex, slides.length, onActiveChange]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-oc-overlay
          className="fixed inset-0 z-(--z-modal) bg-black/90"
        />
        <Dialog.Content
          data-oc-fade-scale
          className="fixed inset-0 z-(--z-modal) flex items-center justify-center p-8"
        >
          <Dialog.Title className="sr-only">Vista a pantalla completa</Dialog.Title>
          <Dialog.Description className="sr-only">
            Slide {activeIndex + 1} de {slides.length}. Usá las flechas para
            moverte y Escape para salir.
          </Dialog.Description>

          <Dialog.Close asChild>
            <IconButton
              label="Salir de pantalla completa"
              size="lg"
              variant="outline"
              className={cn("absolute right-4 top-4 z-10 rounded-full", CHROME)}
            >
              <X className="h-5 w-5" aria-hidden />
            </IconButton>
          </Dialog.Close>

          <IconButton
            label="Slide anterior"
            size="lg"
            variant="outline"
            onClick={() => onActiveChange(activeIndex - 1)}
            disabled={activeIndex <= 0}
            className={cn("absolute left-4 z-10 rounded-full", CHROME)}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </IconButton>

          {slide && (
            <SlideRenderer
              html={slide.html}
              aspectRatio={aspectRatio}
              style={{ width: "100%", height: "100%", maxWidth: 800 }}
            />
          )}

          <IconButton
            label="Slide siguiente"
            size="lg"
            variant="outline"
            onClick={() => onActiveChange(activeIndex + 1)}
            disabled={activeIndex >= slides.length - 1}
            className={cn("absolute right-4 z-10 rounded-full", CHROME)}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </IconButton>

          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onActiveChange(i)}
                aria-label={`Ir al slide ${i + 1}`}
                aria-current={i === activeIndex}
                className={cn(
                  "oc-focus h-2 cursor-pointer rounded-full transition-[width,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  i === activeIndex
                    ? "w-8 bg-white"
                    : "w-2 bg-white/30 hover:bg-white/50"
                )}
              />
            ))}
            <span className="ml-2 text-label tabular-nums text-white/60">
              {activeIndex + 1}/{slides.length}
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
