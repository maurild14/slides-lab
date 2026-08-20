"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Grid3X3, Bookmark, Maximize2, Pencil } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { CarouselPreview } from "@/components/editor/CarouselPreview";
import { SlideFilmstrip } from "@/components/editor/SlideFilmstrip";
import { AspectRatioSelector } from "@/components/editor/AspectRatioSelector";
import { ExportButton } from "@/components/editor/ExportButton";
import { CaptionPanel } from "@/components/editor/CaptionPanel";
import { FullscreenPreview } from "@/components/editor/FullscreenPreview";
import { InspectorPanel } from "@/components/editor/inspector/InspectorPanel";
import { SlideCanvas } from "@/components/editor/SlideCanvas";
import { stripInspectorAttrs } from "@/lib/inspector-utils";
import type { Carousel, AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";
import type { EngineStatus } from "@/lib/agents";

// Assume both engines work until /api/chat/check answers, so the panel doesn't
// flash an "install a CLI" empty state on every page load.
const OPTIMISTIC_ENGINES: EngineStatus[] = [
  { id: "claude", label: "Claude", available: true, supportsImagegen: false },
  { id: "codex", label: "Codex", available: true, supportsImagegen: true },
];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CarouselEditorPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [engines, setEngines] = useState<EngineStatus[]>(OPTIMISTIC_ENGINES);
  const [chatOpen, setChatOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(
    null
  );
  const [iframeReadyTick, setIframeReadyTick] = useState(0);
  const [dragImageUrl, setDragImageUrl] = useState<string | null>(null);
  // Bumped on every slide mutation so the inspector re-reads the element it
  // is showing — a canvas drag changes position behind its back otherwise.
  const [mutationTick, setMutationTick] = useState(0);
  const [isSavingSlide, setIsSavingSlide] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  // Ref for focusing chat input when + button is clicked
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

  const canGenerateImages = engines.some(
    (e) => e.available && e.supportsImagegen
  );

  const fetchCarousel = useCallback(async () => {
    try {
      const res = await fetch(`/api/carousels/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setCarousel((prev) => {
          // If new slides were added during generation, jump to the latest slide
          if (prev && data.slides.length > prev.slides.length) {
            setActiveSlide(data.slides.length - 1);
          } else {
            setActiveSlide((prevIdx) =>
              data.slides.length === 0 ? 0 : Math.min(prevIdx, data.slides.length - 1)
            );
          }
          return data;
        });
      }
    } catch {
      // ignore network errors
    }
  }, [id]);

  // Initial data load
  useEffect(() => {
    const load = async () => {
      await fetchCarousel();
      try {
        const res = await fetch("/api/chat/check");
        const data: { engines?: EngineStatus[] } = await res.json();
        if (data.engines?.length) setEngines(data.engines);
      } catch {
        // keep the optimistic list; the chat request will surface the truth
      }
    };
    load();
  }, [fetchCarousel]);

  // Poll for carousel updates while AI is generating slides
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      fetchCarousel();
    }, 500);
    return () => clearInterval(interval);
  }, [isGenerating, fetchCarousel]);

  const handleAspectChange = async (ratio: AspectRatio) => {
    if (!carousel) return;
    const res = await fetch(`/api/carousels/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aspectRatio: ratio }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCarousel(updated);
    }
  };

  const handleDeleteSlide = (slideId: string) => {
    if (!carousel) return;
    const slideIndex = carousel.slides.findIndex((s) => s.id === slideId);
    setConfirmState({
      open: true,
      title: `Delete slide ${slideIndex + 1}?`,
      description: "This action cannot be undone.",
      onConfirm: async () => {
        const res = await fetch(`/api/carousels/${id}/slides/${slideId}`, {
          method: "DELETE",
        });
        if (res.ok) await fetchCarousel();
      },
    });
  };

  const handleUndoSlide = useCallback(
    async (slideId: string) => {
      const res = await fetch(`/api/carousels/${id}/slides/${slideId}/undo`, {
        method: "POST",
      });
      if (res.ok) await fetchCarousel();
    },
    [id, fetchCarousel]
  );

  const handleDeleteCarousel = useCallback(() => {
    if (!carousel) return;
    setConfirmState({
      open: true,
      title: `Delete "${carousel.name}"?`,
      description: "This will permanently delete the carousel and all its slides.",
      onConfirm: async () => {
        const res = await fetch(`/api/carousels/${id}`, { method: "DELETE" });
        if (res.ok) router.push("/");
      },
    });
  }, [carousel, id, router]);

  const handleStreamStart = useCallback(() => {
    setIsGenerating(true);
  }, []);

  const handleStreamEnd = useCallback(() => {
    setIsGenerating(false);
    fetchCarousel();
  }, [fetchCarousel]);

  const handleReorderSlides = useCallback(
    async (slideIds: string[]) => {
      await fetch(`/api/carousels/${id}/slides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideIds }),
      });
      await fetchCarousel();
    },
    [id, fetchCarousel]
  );

  const handleAddSlideRequest = useCallback(() => {
    setChatOpen(true);
    // Focus chat input after a tick (to let panel render)
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
  }, []);

  // ---- Inline editor: debounced save of mutated slide HTML ----
  // We deliberately don't update local carousel state on save — the iframe
  // DOM is the source of truth while editing, and the server already has
  // the canonical copy. Touching state would change `slide.html`, re-render
  // the iframe, and wipe the user's selection mid-edit.
  const persistCurrentSlide = useCallback(async () => {
    if (!carousel) return;
    const slide = carousel.slides[activeSlide];
    const iframe = iframeRef.current;
    const body = iframe?.contentDocument?.body;
    if (!slide || !body) return;
    const html = stripInspectorAttrs(body.innerHTML);
    setIsSavingSlide(true);
    try {
      await fetch(`/api/carousels/${id}/slides/${slide.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
    } finally {
      setIsSavingSlide(false);
    }
  }, [carousel, activeSlide, id]);

  const handleSlideMutate = useCallback(() => {
    setMutationTick((n) => n + 1);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistCurrentSlide();
    }, 450);
  }, [persistCurrentSlide]);

  // Flush + refetch when leaving edit mode so the in-memory carousel
  // catches up with what we sent to the server.
  const handleToggleEditMode = useCallback(async () => {
    if (editMode) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      await persistCurrentSlide();
      setEditMode(false);
      await fetchCarousel();
    } else {
      setEditMode(true);
    }
  }, [editMode, persistCurrentSlide, fetchCarousel]);

  const handleInspectorUndo = useCallback(async () => {
    if (!carousel) return;
    const slide = carousel.slides[activeSlide];
    if (!slide) return;
    setSelectedElement(null);
    await handleUndoSlide(slide.id);
    setIframeReadyTick((n) => n + 1);
  }, [carousel, activeSlide, handleUndoSlide]);

  // Clear selection when active slide changes or edit mode toggles off
  const [lastSelectionContext, setLastSelectionContext] = useState({
    slide: activeSlide,
    mode: editMode,
  });
  if (
    lastSelectionContext.slide !== activeSlide ||
    lastSelectionContext.mode !== editMode
  ) {
    setLastSelectionContext({ slide: activeSlide, mode: editMode });
    setSelectedElement(null);
  }

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (notFound) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold">Carousel not found</p>
        <p className="text-sm text-muted-foreground">
          This carousel may have been deleted.
        </p>
        <Link href="/" className="text-sm text-accent underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!carousel) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title={carousel.name}
        showBack
        editable
        onTitleChange={async (name) => {
          const res = await fetch(`/api/carousels/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          if (res.ok) {
            const updated = await res.json();
            setCarousel(updated);
          }
        }}
      />

      {/* Fullscreen preview */}
      <FullscreenPreview
        open={showFullscreen}
        onOpenChange={setShowFullscreen}
        slides={carousel.slides}
        aspectRatio={carousel.aspectRatio}
        activeIndex={activeSlide}
        onActiveChange={setActiveSlide}
      />

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((s) => ({ ...s, open }))}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmState.onConfirm}
      />

      {/* Main editor area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Chat panel */}
        {chatOpen && (
          <div className="oc-fade w-80 border-r border-border shrink-0 flex flex-col bg-surface">
            <ChatPanel
              carouselId={id}
              engines={engines}
              referenceImages={carousel.referenceImages || []}
              onStreamStart={handleStreamStart}
              onStreamEnd={handleStreamEnd}
              chatInputRef={chatInputRef}
            />
          </div>
        )}

        {/* Right side: toolbar + preview */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Toolbar */}
          <div className="h-11 border-b border-border bg-surface flex items-center px-4 gap-3 shrink-0">
            <AspectRatioSelector
              value={carousel.aspectRatio}
              onChange={handleAspectChange}
            />
            <div className="flex-1" />
            <Button
              variant={editMode ? "outline" : "ghost"}
              size="sm"
              onClick={handleToggleEditMode}
              className={
                editMode
                  ? "border-accent text-accent gap-1.5"
                  : "text-muted-foreground gap-1.5"
              }
              aria-label="Toggle edit mode"
              title="Click elements on the slide to edit them"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="text-xs">Edit</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFullscreen(true)}
              className="text-muted-foreground"
              aria-label="Fullscreen preview"
              title="Fullscreen preview"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={showSafeZones ? "outline" : "ghost"}
              size="sm"
              onClick={() => setShowSafeZones(!showSafeZones)}
              className={showSafeZones ? "border-accent text-accent" : "text-muted-foreground"}
              aria-label="Toggle safe zones"
              title="Instagram safe zones"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch("/api/templates", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ carouselId: carousel.id }),
                });
              }}
              className="text-muted-foreground"
              aria-label="Save as template"
              title="Save as template"
            >
              <Bookmark className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteCarousel}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete carousel"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border hover:bg-muted"
            >
              {chatOpen ? "Hide Chat" : "Show Chat"}
            </button>
            <ExportButton
              carouselId={carousel.id}
              slideCount={carousel.slides.length}
            />
          </div>

          {/* Carousel preview + Inspector */}
          <div className="flex-1 flex min-h-0 min-w-0">
            <CarouselPreview
              slides={carousel.slides}
              aspectRatio={carousel.aspectRatio}
              activeIndex={activeSlide}
              onActiveChange={setActiveSlide}
              showSafeZones={showSafeZones}
              editable={editMode}
              selectedElement={selectedElement}
              onSelectElement={setSelectedElement}
              onIframeReady={(iframe) => {
                iframeRef.current = iframe;
                setIframeReadyTick((n) => n + 1);
              }}
            />
            <InspectorPanel
              isOpen={editMode}
              enabled={editMode}
              onClose={handleToggleEditMode}
              selectedElement={selectedElement}
              aspectRatio={carousel.aspectRatio}
              canGenerate={canGenerateImages}
              onImageDragStart={setDragImageUrl}
              iframeReadyTick={iframeReadyTick + mutationTick}
              onMutate={handleSlideMutate}
              onUndo={handleInspectorUndo}
              saving={isSavingSlide}
            />
          </div>

          <SlideCanvas
            iframeRef={iframeRef}
            dimensions={DIMENSIONS[carousel.aspectRatio]}
            active={editMode}
            selectedElement={selectedElement}
            onSelectElement={setSelectedElement}
            dragUrl={dragImageUrl}
            onDragResolved={() => setDragImageUrl(null)}
            onMutate={handleSlideMutate}
            iframeReadyTick={iframeReadyTick}
          />

          {/* Caption panel */}
          <CaptionPanel
            caption={carousel.caption}
            hashtags={carousel.hashtags}
          />
        </div>
      </div>

      {/* Filmstrip */}
      <SlideFilmstrip
        slides={carousel.slides}
        aspectRatio={carousel.aspectRatio}
        activeIndex={activeSlide}
        onActiveChange={setActiveSlide}
        onDeleteSlide={handleDeleteSlide}
        onUndoSlide={handleUndoSlide}
        onAddSlideRequest={handleAddSlideRequest}
        onReorderSlides={handleReorderSlides}
        isGenerating={isGenerating}
      />
    </div>
  );
}
