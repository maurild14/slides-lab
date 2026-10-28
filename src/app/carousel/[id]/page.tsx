"use client";

import { useEffect, useState, useCallback, useRef, useMemo, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Grid3X3, Bookmark, Maximize2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BrandSetup } from "@/components/brand/BrandSetup";
import { ToolRail, type RailTab } from "@/components/editor/rail/ToolRail";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { CarouselPreview } from "@/components/editor/CarouselPreview";
import { SlideFilmstrip } from "@/components/editor/SlideFilmstrip";
import { AspectRatioSelector } from "@/components/editor/AspectRatioSelector";
import { ExportButton } from "@/components/editor/ExportButton";
import { CaptionPanel } from "@/components/editor/CaptionPanel";
import { FullscreenPreview } from "@/components/editor/FullscreenPreview";
import { InspectorPanel } from "@/components/editor/inspector/InspectorPanel";
import type { SectionFocus } from "@/components/editor/inspector/InspectorFields";
import { SlideCanvas } from "@/components/editor/SlideCanvas";
import { CanvasToolbar } from "@/components/editor/CanvasToolbar";
import { ContextToolbar } from "@/components/editor/ContextToolbar";
import { useCanvasCommands } from "@/components/editor/canvas-commands";
import { useSlideEditor } from "@/components/editor/use-slide-editor";
import { clampZoom, getSlideRoot, zoomPanAt } from "@/lib/canvas-utils";
import {
  appendElementToHtml,
  applyBackgroundToHtml,
  reflowSlideHtml,
} from "@/lib/slide-batch";
import { stripInspectorAttrs } from "@/lib/inspector-utils";
import { cn } from "@/lib/utils";
import { useT } from "@/components/locale-provider";
import type { DragPayload } from "@/lib/slide-elements";
import type { BrandConfig } from "@/types/brand";
import { DEFAULT_BRAND, withBrandDefaults } from "@/types/brand";
import type { Carousel, AspectRatio, Slide } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";
import type { EngineStatus } from "@/lib/agents";

// Assume both engines work until /api/chat/check answers, so the panel doesn't
// flash an "install a CLI" empty state on every page load.
// Empty model/effort lists on purpose: this is what the panel shows for the
// moment before /api/chat/check answers, and the real lists live server-side
// next to the validation. Both dropdowns still have their "the CLI decides"
// option, which is the default anyway.
const OPTIMISTIC_ENGINES: EngineStatus[] = [
  {
    id: "claude",
    label: "Claude",
    available: true,
    supportsImagegen: false,
    models: [],
    efforts: [],
  },
  {
    id: "codex",
    label: "Codex",
    available: true,
    supportsImagegen: true,
    models: [],
    efforts: [],
  },
];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CarouselEditorPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const t = useT();
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [engines, setEngines] = useState<EngineStatus[]>(OPTIMISTIC_ENGINES);
  const [railTab, setRailTab] = useState<RailTab | null>("ai");
  const [brand, setBrand] = useState<BrandConfig>(DEFAULT_BRAND);
  const [showBrandSetup, setShowBrandSetup] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<string[]>([]);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [templateStatus, setTemplateStatus] = useState<"ok" | "error" | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [selection, setSelection] = useState<HTMLElement[]>([]);
  const [iframeReadyTick, setIframeReadyTick] = useState(0);
  const [dragItem, setDragItem] = useState<DragPayload | null>(null);
  const [slideDocument, setSlideDocument] = useState<Document | null>(null);
  /**
   * Which advanced section the floating toolbar asked for. The counter is what
   * makes asking twice in a row re-open a section the user just collapsed.
   */
  const [advanced, setAdvanced] = useState<SectionFocus>(null);

  // Zoom and pan live in one object so a single functional update can move
  // both together: zooming about the cursor changes the pan, and computing it
  // from separately-rendered values drops deltas during a fast wheel burst.
  const [view, setView] = useState<{
    zoom: number | null; // null means "whatever fits the viewport"
    pan: { x: number; y: number };
  }>({ zoom: null, pan: { x: 0, y: 0 } });
  const [fitScale, setFitScale] = useState(0);
  const fitRef = useRef(0);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  /** Slide HTML as it stood when the current generation run started. */
  const genBaseRef = useRef<Record<string, string> | null>(null);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    variant?: "destructive" | "default";
    secondaryLabel?: string;
    onSecondary?: () => void;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const canGenerateImages = engines.some((e) => e.available && e.supportsImagegen);
  const dimensions = DIMENSIONS[carousel?.aspectRatio ?? "4:5"];
  const activeSlideId = carousel?.slides[activeSlide]?.id ?? null;
  const slideLocked = activeSlideId !== null && generatingIds.includes(activeSlideId);

  const clearSelection = useCallback(() => setSelection([]), []);

  const openAdvanced = useCallback(
    (section: string) =>
      setAdvanced((prev) => ({ section, n: (prev?.n ?? 0) + 1 })),
    []
  );

  const editor = useSlideEditor({
    carouselId: id,
    slides: carousel?.slides ?? [],
    activeSlide,
    iframeRef,
    onRestore: clearSelection,
  });

  // One object identity per render is enough; the children only read from it.
  const slides = useMemo<Slide[]>(
    () =>
      (carousel?.slides ?? []).map((s) => {
        const html = editor.htmlFor(s);
        return html === s.html ? s : { ...s, html };
      }),
    [carousel?.slides, editor]
  );

  const commands = useCanvasCommands({
    iframeRef,
    selection,
    onSelectionChange: setSelection,
    onCommit: editor.commit,
    dimensions,
    enabled: !slideLocked,
  });

  /* ------------------------------------------------------------- loading */

  /**
   * `focusSlideId` overrides the "follow the newest slide" rule below. That
   * rule exists for the agent appending slides; a duplicate lands in the
   * middle and has to be followed by id, not by position.
   */
  const fetchCarousel = useCallback(async (focusSlideId?: string) => {
    try {
      const res = await fetch(`/api/carousels/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) return;
      const data: Carousel = await res.json();

      // While the agent runs, work out which slides it actually touched: those
      // get locked and reloaded, the rest stay editable.
      const base = genBaseRef.current;
      let touched: string[] = [];
      if (base) {
        touched = data.slides
          .filter((s) => base[s.id] === undefined || base[s.id] !== s.html)
          .map((s) => s.id);
        if (touched.length > 0) {
          // Same list every poll while the agent works on one slide; keeping
          // the old array avoids a re-render on each tick.
          setGeneratingIds((prev) =>
            prev.length === touched.length && prev.every((v, i) => v === touched[i])
              ? prev
              : touched
          );
        }
      }

      setCarousel((prev) => {
        const focused = focusSlideId
          ? data.slides.findIndex((s) => s.id === focusSlideId)
          : -1;
        // If new slides arrived during generation, follow the agent to the
        // newest one; otherwise just keep the index in range.
        if (focused !== -1) {
          setActiveSlide(focused);
        } else if (prev && data.slides.length > prev.slides.length) {
          setActiveSlide(data.slides.length - 1);
        } else {
          setActiveSlide((idx) =>
            data.slides.length === 0 ? 0 : Math.min(idx, data.slides.length - 1)
          );
        }
        return data;
      });
      // Release pins only after the carousel holds the agent's new HTML.
      editor.dropLocal(touched);
    } catch {
      // ignore network errors
    }
  }, [id, editor]);

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
      try {
        setBrand(withBrandDefaults(await (await fetch("/api/brand")).json()));
      } catch {
        // the defaults are a usable palette on their own
      }
    };
    load();
    // Deliberately once: fetchCarousel changes identity on every editor render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll for carousel updates while the AI is writing slides.
  const fetchRef = useRef(fetchCarousel);
  useEffect(() => {
    fetchRef.current = fetchCarousel;
  }, [fetchCarousel]);
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => fetchRef.current(), 500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  /* ---------------------------------------------------------- zoom & pan */

  const onFitScale = useCallback((value: number) => {
    fitRef.current = value;
    setFitScale(value);
  }, []);

  const applyZoom = useCallback(
    (resolve: (from: number) => number, focus?: { x: number; y: number }) => {
      setView((v) => {
        const from = v.zoom ?? fitRef.current;
        if (from <= 0) return v;
        const to = clampZoom(resolve(from), fitRef.current || from);
        return {
          zoom: to,
          pan: focus
            ? zoomPanAt(v.pan, focus, dimensions.width, dimensions.height, from, to)
            : v.pan,
        };
      });
    },
    [dimensions]
  );

  const zoomTo = useCallback(
    (next: number, focus?: { x: number; y: number }) => applyZoom(() => next, focus),
    [applyZoom]
  );
  const zoomBy = useCallback(
    (factor: number, focus?: { x: number; y: number }) =>
      applyZoom((from) => from * factor, focus),
    [applyZoom]
  );
  const panBy = useCallback(
    (dx: number, dy: number) =>
      setView((v) => ({ ...v, pan: { x: v.pan.x + dx, y: v.pan.y + dy } })),
    []
  );
  const panTo = useCallback(
    (pan: { x: number; y: number }) => setView((v) => ({ ...v, pan })),
    []
  );
  const fitToScreen = useCallback(
    () => setView({ zoom: null, pan: { x: 0, y: 0 } }),
    []
  );

  // A new slide, or a new shape of slide, starts from a clean view.
  const [viewContext, setViewContext] = useState({
    slide: activeSlideId,
    ratio: carousel?.aspectRatio,
  });
  if (
    viewContext.slide !== activeSlideId ||
    viewContext.ratio !== carousel?.aspectRatio
  ) {
    setViewContext({ slide: activeSlideId, ratio: carousel?.aspectRatio });
    setSelection([]);
    setView({ zoom: null, pan: { x: 0, y: 0 } });
  }

  /* ----------------------------------------------------------- mutations */

  const changeSlide = useCallback(
    async (index: number) => {
      if (index === activeSlide) return;
      // The edit-mode toggle used to be the moment work reached the server.
      // Changing slide is now one of the explicit replacements.
      await editor.flush();
      setActiveSlide(index);
    },
    [activeSlide, editor]
  );

  const setAspectRatio = useCallback(
    async (ratio: AspectRatio) => {
      const res = await fetch(`/api/carousels/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspectRatio: ratio }),
      });
      if (res.ok) setCarousel(await res.json());
    },
    [id]
  );

  const handleAspectChange = async (ratio: AspectRatio) => {
    if (!carousel || ratio === carousel.aspectRatio) return;
    await editor.flush();

    const from = DIMENSIONS[carousel.aspectRatio];
    const to = DIMENSIONS[ratio];
    const current = carousel.slides;

    // Changing the number used to be the whole operation, which left every
    // slide's content sitting where it was on a canvas of another shape.
    setConfirmState({
      open: true,
      title: t("Switch the carousel to {ratio}?", { ratio }),
      description: t("We can rescale the content of the {n} slides to fit the new canvas. It's an approximation: review each slide afterwards. Each one keeps its previous version, so you can go back from “Previous version”.", { n: current.length }),
      confirmLabel: t("Rescale the content"),
      // Nothing is deleted here, and every slide keeps its previous version.
      // The dialog defaults to destructive, so it has to say otherwise.
      variant: "default",
      secondaryLabel: t("Only change the canvas"),
      onSecondary: () => {
        setAspectRatio(ratio);
      },
      onConfirm: async () => {
        for (const slide of current) {
          const html = editor.htmlFor(slide);
          await fetch(`/api/carousels/${id}/slides/${slide.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html: reflowSlideHtml(html, from, to) }),
          });
        }
        // Order matters: `dropLocal` releases the pin that keeps the iframe
        // from reloading, and the render that follows takes whatever html the
        // carousel state holds *at that moment*. Dropping first re-pins the
        // pre-reflow document, and the next autosave writes it back over the
        // slide we just rescaled.
        await setAspectRatio(ratio);
        editor.dropLocal(current.map((s) => s.id));
        setIframeReadyTick((n) => n + 1);
      },
    });
  };

  const handleDeleteSlide = (slideId: string) => {
    if (!carousel) return;
    const index = carousel.slides.findIndex((s) => s.id === slideId);
    setConfirmState({
      open: true,
      title: t("Delete slide {n}?", { n: index + 1 }),
      description: t("This can't be undone from here."),
      onConfirm: async () => {
        const res = await fetch(`/api/carousels/${id}/slides/${slideId}`, {
          method: "DELETE",
        });
        if (res.ok) await fetchCarousel();
      },
    });
  };

  const handleDuplicateSlide = useCallback(
    async (slideId: string) => {
      await editor.flush();
      const res = await fetch(`/api/carousels/${id}/slides/${slideId}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) return;
      const copy: { id?: string } = await res.json();
      // Land on the copy: duplicating is almost always the first half of
      // "and now change this one".
      await fetchCarousel(copy.id);
    },
    [id, editor, fetchCarousel]
  );

  const handleUndoSlide = useCallback(
    async (slideId: string) => {
      setSelection([]);
      const res = await fetch(`/api/carousels/${id}/slides/${slideId}/undo`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchCarousel();
        editor.dropLocal([slideId]);
        setIframeReadyTick((n) => n + 1);
      }
    },
    [id, fetchCarousel, editor]
  );

  const handleDeleteCarousel = useCallback(() => {
    if (!carousel) return;
    setConfirmState({
      open: true,
      title: t("Delete “{name}”?", { name: carousel.name }),
      description: t("The carousel and all its slides are deleted, for good."),
      onConfirm: async () => {
        const res = await fetch(`/api/carousels/${id}`, { method: "DELETE" });
        if (res.ok) router.push("/");
      },
    });
  }, [carousel, id, router, t]);

  /* --------------------------------------------- writing into the slide */

  const slideDoc = useCallback((): Document | null => {
    try {
      return iframeRef.current?.contentDocument ?? null;
    } catch {
      return null;
    }
  }, []);

  /** Write one CSS property across the selection as a single undo step. */
  const applyStyle = useCallback(
    (property: string, value: string) => {
      if (selection.length === 0 || slideLocked) return;
      const prop = property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      for (const el of selection) {
        el.style.setProperty(prop, value);
        // A colour alone draws nothing on an element with no border: picking
        // "Borde" in the brand panel and then a swatch looked like a dead
        // button on every shape that did not already have one.
        const win = el.ownerDocument.defaultView;
        if (
          prop === "border-color" &&
          win &&
          Number.parseFloat(win.getComputedStyle(el).borderTopWidth) === 0
        ) {
          el.style.setProperty("border-style", "solid");
          el.style.setProperty("border-width", "2px");
        }
      }
      editor.commit();
    },
    [selection, slideLocked, editor]
  );

  const replaceSlideHtml = useCallback(
    (html: string) => {
      const doc = slideDoc();
      if (!doc?.body || slideLocked) return;
      setSelection([]);
      doc.body.innerHTML = html;
      setIframeReadyTick((n) => n + 1);
      editor.commit();
    },
    [slideDoc, slideLocked, editor]
  );

  const setSlideBackground = useCallback(
    (css: string) => {
      const doc = slideDoc();
      if (!doc?.body || slideLocked) return;
      getSlideRoot(doc).style.background = css;
      editor.commit();
    },
    [slideDoc, slideLocked, editor]
  );

  const replaceImage = useCallback(
    (url: string) => {
      const el = selection.length === 1 ? selection[0] : null;
      if (!el || el.tagName.toLowerCase() !== "img" || slideLocked) return;
      (el as HTMLImageElement).src = url;
      editor.commit();
    },
    [selection, slideLocked, editor]
  );

  // Read back from the DOM rather than holding a copy: the agent and the
  // undo stack both write here, and a mirrored value would go stale.
  const slideBackground = useMemo(() => {
    void editor.mutationTick;
    void iframeReadyTick;
    const doc = slideDoc();
    if (!doc?.body) return "";
    const root = getSlideRoot(doc);
    return root.style.backgroundColor || root.style.background || "";
  }, [slideDoc, editor.mutationTick, iframeReadyTick]);

  /* ------------------------------------------- applying across the carousel */

  /**
   * Rewrite every *other* slide. The active one already has the change on
   * screen; re-sending it would only reload its iframe and drop the selection.
   */
  const applyToOtherSlides = useCallback(
    async (transform: (html: string) => string) => {
      await editor.flush();
      const others = slides.filter((s) => s.id !== activeSlideId);
      for (const slide of others) {
        await fetch(`/api/carousels/${id}/slides/${slide.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: transform(slide.html) }),
        });
      }
      await fetchCarousel();
      editor.dropLocal(others.map((s) => s.id));
    },
    [editor, slides, activeSlideId, id, fetchCarousel]
  );

  const otherCount = (carousel?.slides.length ?? 1) - 1;

  const handleApplyBackgroundToAll = useCallback(() => {
    if (!slideBackground || otherCount < 1) return;
    setConfirmState({
      open: true,
      title: t("Put this background on the other {n} slides?", { n: otherCount }),
      description: t("Each one's background is replaced. Every slide keeps its previous version, so you can undo them one at a time."),
      confirmLabel: t("Apply to all"),
      variant: "default",
      onConfirm: () => {
        applyToOtherSlides((html) => applyBackgroundToHtml(html, slideBackground));
      },
    });
  }, [slideBackground, otherCount, applyToOtherSlides, t]);

  const handleApplyElementToAll = useCallback(() => {
    if (selection.length !== 1 || otherCount < 1) return;
    const markup = stripInspectorAttrs(selection[0].outerHTML);
    setConfirmState({
      open: true,
      title: t("Copy this element to the other {n} slides?", { n: otherCount }),
      description: t("It is added on top of everything, in the same position. Nothing they already have is replaced."),
      confirmLabel: t("Apply to all"),
      variant: "default",
      onConfirm: () => {
        applyToOtherSlides((html) => appendElementToHtml(html, markup));
      },
    });
  }, [selection, otherCount, applyToOtherSlides, t]);

  const swatches = useMemo(
    () => [
      { color: brand.colors.primary, name: t("Primary") },
      { color: brand.colors.secondary, name: t("Secondary") },
      { color: brand.colors.accent, name: t("Accent") },
      { color: brand.colors.background, name: t("Background") },
      { color: brand.colors.surface, name: t("Surface") },
    ],
    [brand.colors, t]
  );

  const brandFonts = useMemo(
    () => [brand.fonts.heading, brand.fonts.body],
    [brand.fonts]
  );

  const saveBrand = useCallback(async (input: BrandConfig) => {
    const next = withBrandDefaults(input);
    setBrand(next);
    await fetch("/api/brand", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {
      // the panel already shows the new value; a failed write retries on the
      // next change rather than reverting under the user
    });
  }, []);

  /* ------------------------------------------------------ AI integration */

  const handleBeforeSend = useCallback(async () => {
    // Hand the agent a slide that already contains the manual edits, so its
    // rewrite builds on them instead of racing them.
    await editor.flush();
    genBaseRef.current = Object.fromEntries(
      (carousel?.slides ?? []).map((s) => [s.id, s.html])
    );
  }, [editor, carousel?.slides]);

  const handleStreamStart = useCallback(() => {
    setIsGenerating(true);
    setSelection([]);
  }, []);

  const handleStreamEnd = useCallback(() => {
    setIsGenerating(false);
    genBaseRef.current = null;
    setGeneratingIds([]);
    setIframeReadyTick((n) => n + 1);
    fetchRef.current();
  }, []);

  const handleReorderSlides = useCallback(
    async (slideIds: string[]) => {
      await editor.flush();
      await fetch(`/api/carousels/${id}/slides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideIds }),
      });
      await fetchCarousel();
    },
    [id, fetchCarousel, editor]
  );

  const handleAddSlideRequest = useCallback(() => {
    setRailTab("ai");
    setTimeout(() => chatInputRef.current?.focus(), 100);
  }, []);

  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) return null;
      const data: { url?: string } = await res.json();
      return data.url ?? null;
    } catch {
      return null;
    }
  }, []);

  /* -------------------------------------------------------------- render */

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-title font-semibold">{t("We couldn't find this carousel")}</p>
        <p className="text-body text-muted-foreground">
          {t("You may have deleted it.")}
        </p>
        <Button variant="outline" asChild>
          <Link href="/">{t("Back to home")}</Link>
        </Button>
      </div>
    );
  }

  if (!carousel) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
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
          if (res.ok) setCarousel(await res.json());
        }}
      />

      <FullscreenPreview
        open={showFullscreen}
        onOpenChange={setShowFullscreen}
        slides={slides}
        aspectRatio={carousel.aspectRatio}
        activeIndex={activeSlide}
        onActiveChange={setActiveSlide}
      />

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((s) => ({ ...s, open }))}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel ?? t("Delete")}
        variant={confirmState.variant ?? "destructive"}
        secondaryLabel={confirmState.secondaryLabel}
        onSecondary={confirmState.onSecondary}
        onConfirm={confirmState.onConfirm}
      />

      <BrandSetup
        open={showBrandSetup}
        onComplete={() => {
          setShowBrandSetup(false);
          fetch("/api/brand")
            .then((r) => r.json())
            .then((b) => setBrand(withBrandDefaults(b)))
            .catch(() => {});
        }}
        initialBrand={brand}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ToolRail
          active={railTab}
          onActiveChange={setRailTab}
          brand={brand}
          onBrandChange={saveBrand}
          onEditBrand={() => setShowBrandSetup(true)}
          aspectRatio={carousel.aspectRatio}
          canGenerate={canGenerateImages}
          selection={selection}
          onInsert={setDragItem}
          onUpload={uploadImage}
          onApplyStyle={applyStyle}
          onReplaceSlide={replaceSlideHtml}
          onReplaceImage={replaceImage}
          onBackground={setSlideBackground}
          background={slideBackground}
          carouselId={id}
          engines={engines}
          referenceImages={carousel.referenceImages || []}
          onBeforeSend={handleBeforeSend}
          onStreamStart={handleStreamStart}
          onStreamEnd={handleStreamEnd}
          chatInputRef={chatInputRef}
          onClearSelection={clearSelection}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Canvas chrome. 44px with 4px of vertical padding, not 40px flush:
              the row scrolls horizontally, and a scroll container clips at its
              padding box — flush, it sheared the focus ring off every control
              inside it. */}
          <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface px-3 py-1">
            <CanvasToolbar
              scale={view.zoom ?? fitScale}
              onZoomTo={zoomTo}
              onZoomBy={zoomBy}
              onFit={fitToScreen}
              canUndo={editor.canUndo}
              canRedo={editor.canRedo}
              onUndo={editor.undo}
              onRedo={editor.redo}
              saving={editor.saving}
            />

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <AspectRatioSelector
                value={carousel.aspectRatio}
                onChange={handleAspectChange}
                label={t("Aspect ratio")}
              />
              <IconButton
                label={t("Full-screen view")}
                size="sm"
                onClick={() => setShowFullscreen(true)}
              >
                <Maximize2 className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton
                label={t("Instagram safe zones")}
                size="sm"
                active={showSafeZones}
                onClick={() => setShowSafeZones(!showSafeZones)}
              >
                <Grid3X3 className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton
                label={t("Save as template")}
                size="sm"
                onClick={async () => {
                  await editor.flush();
                  const res = await fetch("/api/templates", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ carouselId: carousel.id }),
                  });
                  setTemplateStatus(res.ok ? "ok" : "error");
                  window.setTimeout(() => setTemplateStatus(null), 3000);
                }}
              >
                <Bookmark className="h-4 w-4" aria-hidden />
              </IconButton>
              {/* This used to fire and say nothing at all. */}
              {templateStatus && (
                <span
                  role="status"
                  className={cn(
                    "shrink-0 text-label",
                    templateStatus === "ok" ? "text-muted-foreground" : "text-destructive"
                  )}
                >
                  {templateStatus === "ok"
                    ? t("Saved as template")
                    : t("Couldn't save")}
                </span>
              )}
              <IconButton
                label={t("Delete the carousel")}
                size="sm"
                onClick={handleDeleteCarousel}
                className="hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconButton>
              <ExportButton
                carouselId={carousel.id}
                slideCount={carousel.slides.length}
                activeSlideId={activeSlideId}
                activeSlideNumber={activeSlide + 1}
                onBeforeExport={editor.flush}
              />
            </div>
          </div>

          <ContextToolbar
            element={selection.length === 1 ? selection[0] : null}
            selectionCount={selection.length}
            tick={iframeReadyTick + editor.mutationTick}
            onMutate={editor.commit}
            commands={commands}
            enabled={!slideLocked}
            swatches={swatches}
            brandFonts={brandFonts}
            onOpenAdvanced={openAdvanced}
            onOpenImages={() => setRailTab("images")}
            onApplyToAll={otherCount > 0 ? handleApplyElementToAll : undefined}
          />

          {/* Canvas + inspector */}
          <div className="flex min-h-0 min-w-0 flex-1">
            <CarouselPreview
              slides={slides}
              aspectRatio={carousel.aspectRatio}
              activeIndex={activeSlide}
              onActiveChange={changeSlide}
              showSafeZones={showSafeZones}
              viewportRef={viewportRef}
              scale={view.zoom ?? undefined}
              pan={view.pan}
              onFitScale={onFitScale}
              generating={slideLocked}
              onIframeReady={(iframe) => {
                iframeRef.current = iframe;
                setSlideDocument(iframe.contentDocument);
                setSelection([]);
                setIframeReadyTick((n) => n + 1);
                editor.registerIframe();
              }}
            />
            <aside
              className="flex w-props shrink-0 flex-col border-l border-border bg-surface"
              aria-label={t("Layers and properties")}
            >
              <div className="flex max-h-[45%] min-h-0 flex-col">
                <LayersPanel
                  doc={slideDocument}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onCommit={editor.commit}
                  tick={iframeReadyTick + editor.mutationTick}
                  enabled={!slideLocked}
                />
              </div>
              <InspectorPanel
                onClose={clearSelection}
                selectedElement={selection.length === 1 ? selection[0] : null}
                selectionCount={selection.length}
                iframeReadyTick={iframeReadyTick + editor.mutationTick}
                onMutate={editor.commit}
                onUndo={() => activeSlideId && handleUndoSlide(activeSlideId)}
                focus={advanced}
                accent={brand.colors.primary}
                swatches={swatches}
                onUpload={uploadImage}
                saving={editor.saving}
              />
            </aside>
          </div>

          <SlideCanvas
            iframeRef={iframeRef}
            viewportRef={viewportRef}
            dimensions={dimensions}
            enabled={!slideLocked}
            selection={selection}
            onSelectionChange={setSelection}
            dragItem={dragItem}
            onDragResolved={() => setDragItem(null)}
            onCommit={editor.commit}
            iframeReadyTick={iframeReadyTick}
            scale={view.zoom ?? fitScale}
            pan={view.pan}
            onPanTo={panTo}
            onPanBy={panBy}
            onZoomBy={zoomBy}
            onZoomTo={zoomTo}
            onFit={fitToScreen}
            commands={commands}
            onUndo={editor.undo}
            onRedo={editor.redo}
            onUploadImage={uploadImage}
            onApplyElementToAll={otherCount > 0 ? handleApplyElementToAll : undefined}
            onApplyBackgroundToAll={
              otherCount > 0 && slideBackground ? handleApplyBackgroundToAll : undefined
            }
          />

          <CaptionPanel caption={carousel.caption} hashtags={carousel.hashtags} />
        </div>
      </div>

      <SlideFilmstrip
        slides={slides}
        aspectRatio={carousel.aspectRatio}
        activeIndex={activeSlide}
        onActiveChange={changeSlide}
        onDeleteSlide={handleDeleteSlide}
        onDuplicateSlide={handleDuplicateSlide}
        onUndoSlide={handleUndoSlide}
        onAddSlideRequest={handleAddSlideRequest}
        onReorderSlides={handleReorderSlides}
        isGenerating={isGenerating}
        generatingIds={generatingIds}
      />
    </div>
  );
}
