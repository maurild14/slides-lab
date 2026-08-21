"use client";

import { Copy, Plus, Trash2, Undo2, GripVertical, Sparkles } from "lucide-react";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { SlideRenderer } from "./SlideRenderer";
import type { Slide, AspectRatio } from "@/types/carousel";
import { DIMENSIONS, MAX_SLIDES } from "@/types/carousel";
import { cn } from "@/lib/utils";

interface SlideFilmstripProps {
  slides: Slide[];
  aspectRatio: AspectRatio;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onDeleteSlide?: (slideId: string) => void;
  onDuplicateSlide?: (slideId: string) => void;
  onUndoSlide?: (slideId: string) => void;
  onAddSlideRequest?: () => void;
  onReorderSlides?: (slideIds: string[]) => void;
  isGenerating?: boolean;
  /** Slides the agent is currently rewriting. */
  generatingIds?: string[];
}

function SortableSlideThumb({
  slide,
  index,
  isActive,
  thumbWidth,
  thumbHeight,
  aspectRatio,
  onSelect,
  onDelete,
  onDuplicate,
  onUndo,
  generating = false,
}: {
  slide: Slide;
  index: number;
  isActive: boolean;
  thumbWidth: number;
  thumbHeight: number;
  aspectRatio: AspectRatio;
  onSelect: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onUndo?: () => void;
  generating?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("oc-enter-pop relative group shrink-0", isDragging && "!opacity-50")}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        aria-label={`Reordenar el slide ${index + 1}`}
        className="absolute -left-1.5 top-1/2 z-10 flex h-8 w-4 -translate-y-1/2 cursor-grab items-center justify-center rounded text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </div>

      <button
        onClick={onSelect}
        className={cn(
          "oc-press block rounded-lg overflow-hidden transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] border-2",
          isActive
            ? "border-accent shadow-md ring-2 ring-accent/20"
            : "border-border hover:border-muted-foreground/50"
        )}
        style={{ width: thumbWidth, height: thumbHeight }}
        aria-label={`Ir al slide ${index + 1}`}
        aria-current={isActive}
      >
        <SlideRenderer
          html={slide.html}
          aspectRatio={aspectRatio}
          className="w-full h-full"
        />
      </button>

      {generating && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-foreground/45">
          <Sparkles className="h-4 w-4 animate-pulse text-background" aria-hidden />
          <span className="sr-only">La IA está escribiendo este slide</span>
        </div>
      )}

      {/* Always present, never hover-only: an action you cannot see is an
          action that does not exist. Hover and focus only raise the contrast. */}
      <div className="absolute -right-1.5 -top-1.5 flex gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {onDuplicate && (
          <Button
            variant="outline"
            size="icon-sm"
            className="oc-hit h-6 w-6 rounded-full p-0 shadow-raised"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            aria-label={`Duplicar el slide ${index + 1}`}
            title="Duplicar el slide"
          >
            <Copy className="h-3 w-3" aria-hidden />
          </Button>
        )}
        {onUndo && slide.previousVersions.length > 0 && (
          <Button
            variant="outline"
            size="icon-sm"
            className="oc-hit h-6 w-6 rounded-full p-0 shadow-raised"
            onClick={(e) => {
              e.stopPropagation();
              onUndo();
            }}
            aria-label={`Volver a la versión anterior del slide ${index + 1}`}
            title="Volver a la versión anterior"
          >
            <Undo2 className="h-3 w-3" aria-hidden />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="outline"
            size="icon-sm"
            className="oc-hit h-6 w-6 rounded-full p-0 text-destructive shadow-raised hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Eliminar el slide ${index + 1}`}
            title="Eliminar el slide"
          >
            <Trash2 className="h-3 w-3" aria-hidden />
          </Button>
        )}
      </div>

      {/* Slide number */}
      <div className="absolute bottom-1 left-1 text-micro font-bold text-white bg-black/60 rounded px-1 py-0.5 leading-none">
        {index + 1}
      </div>
    </div>
  );
}

export function SlideFilmstrip({
  slides,
  aspectRatio,
  activeIndex,
  onActiveChange,
  onDeleteSlide,
  onDuplicateSlide,
  onUndoSlide,
  onAddSlideRequest,
  onReorderSlides,
  isGenerating,
  generatingIds = [],
}: SlideFilmstripProps) {
  const { width: slideW, height: slideH } = DIMENSIONS[aspectRatio];
  const thumbHeight = 80;
  const thumbWidth = Math.round(thumbHeight * (slideW / slideH));

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = slides.findIndex((s) => s.id === active.id);
    const newIndex = slides.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Build new order
    const newSlides = [...slides];
    const [moved] = newSlides.splice(oldIndex, 1);
    newSlides.splice(newIndex, 0, moved);

    onReorderSlides?.(newSlides.map((s) => s.id));

    // Update active index to follow the selected slide
    if (activeIndex === oldIndex) {
      onActiveChange(newIndex);
    } else if (activeIndex > oldIndex && activeIndex <= newIndex) {
      onActiveChange(activeIndex - 1);
    } else if (activeIndex < oldIndex && activeIndex >= newIndex) {
      onActiveChange(activeIndex + 1);
    }
  };

  return (
    <div className="border-t border-border bg-surface shrink-0">
      <div className="h-28 flex items-center gap-3 px-4 overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={slides.map((s) => s.id)}
            strategy={horizontalListSortingStrategy}
          >
            {slides.map((slide, index) => (
              <SortableSlideThumb
                key={slide.id}
                slide={slide}
                index={index}
                isActive={index === activeIndex}
                thumbWidth={thumbWidth}
                thumbHeight={thumbHeight}
                aspectRatio={aspectRatio}
                onSelect={() => onActiveChange(index)}
                onDelete={onDeleteSlide ? () => onDeleteSlide(slide.id) : undefined}
                onDuplicate={
                  onDuplicateSlide && slides.length < MAX_SLIDES
                    ? () => onDuplicateSlide(slide.id)
                    : undefined
                }
                onUndo={onUndoSlide ? () => onUndoSlide(slide.id) : undefined}
                generating={generatingIds.includes(slide.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {isGenerating && (
          <div
            className="shrink-0 rounded-lg border-2 border-dashed border-accent/50 flex items-center justify-center bg-accent/5"
            style={{ width: thumbWidth, height: thumbHeight }}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-micro font-medium text-accent">Creando</span>
            </div>
          </div>
        )}

        {slides.length < MAX_SLIDES && !isGenerating && (
          <button
            onClick={onAddSlideRequest}
            className="shrink-0 rounded-lg border-2 border-dashed border-border flex items-center justify-center hover:border-muted-foreground/50 hover:bg-muted/50 transition-colors cursor-pointer"
            style={{ width: thumbWidth, height: thumbHeight }}
            aria-label="Agregar un slide con la IA"
            title="Agregar un slide con la IA"
          >
            <Plus className="h-5 w-5 text-muted-foreground" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
