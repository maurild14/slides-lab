"use client";

import { useT } from "@/components/locale-provider";
import { useMemo } from "react";
import {
  Image as ImageIcon,
  LayoutGrid,
  Palette,
  Shapes,
  Sparkles,
  Type as TypeIcon,
} from "lucide-react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { cn } from "@/lib/utils";
import { elementLabel, type DragPayload } from "@/lib/slide-elements";
import { DesignPanel } from "./DesignPanel";
import { ElementsPanel } from "./ElementsPanel";
import { TextPanel } from "./TextPanel";
import { ImagesPanel } from "./ImagesPanel";
import { BrandPanel } from "./BrandPanel";
import { PanelShell } from "./panel-kit";
import type { BrandConfig } from "@/types/brand";
import type { AspectRatio, ReferenceImage } from "@/types/carousel";
import type { EngineStatus } from "@/lib/agents";

export type RailTab = "design" | "elements" | "text" | "images" | "brand" | "ai";

const TABS: { id: RailTab; label: string; Icon: typeof Shapes }[] = [
  { id: "design", label: "Design", Icon: LayoutGrid },
  { id: "elements", label: "Elements", Icon: Shapes },
  { id: "text", label: "Text", Icon: TypeIcon },
  { id: "images", label: "Images", Icon: ImageIcon },
  { id: "brand", label: "Brand", Icon: Palette },
  { id: "ai", label: "AI", Icon: Sparkles },
];

interface Props {
  active: RailTab | null;
  onActiveChange: (tab: RailTab | null) => void;

  brand: BrandConfig;
  onBrandChange: (brand: BrandConfig) => void;
  onEditBrand: () => void;
  aspectRatio: AspectRatio;
  canGenerate: boolean;

  selection: HTMLElement[];
  onInsert: (payload: DragPayload) => void;
  onUpload: (file: File) => Promise<string | null>;
  onApplyStyle: (property: string, value: string) => void;
  onReplaceSlide: (html: string) => void;
  onReplaceImage: (url: string) => void;
  onBackground: (css: string) => void;
  background: string;

  carouselId: string;
  engines: EngineStatus[];
  referenceImages: ReferenceImage[];
  onBeforeSend: () => Promise<void>;
  onStreamStart: () => void;
  onStreamEnd: () => void;
  chatInputRef: React.RefObject<HTMLTextAreaElement | null>;
  onClearSelection: () => void;
}

/**
 * The left rail and whatever panel it has open.
 *
 * Every destination carries a visible text label under its icon. A rail of
 * bare glyphs is exactly the "los menús no andan" complaint: nothing is
 * broken, you just cannot tell what anything is.
 */
export function ToolRail({
  active,
  onActiveChange,
  brand,
  onBrandChange,
  onEditBrand,
  aspectRatio,
  canGenerate,
  selection,
  onInsert,
  onUpload,
  onApplyStyle,
  onReplaceSlide,
  onReplaceImage,
  onBackground,
  background,
  carouselId,
  engines,
  referenceImages,
  onBeforeSend,
  onStreamStart,
  onStreamEnd,
  chatInputRef,
  onClearSelection,
}: Props) {
  const t = useT();
  const close = () => onActiveChange(null);

  const selectedImage = useMemo(() => {
    const only = selection.length === 1 ? selection[0] : null;
    return only && only.tagName.toLowerCase() === "img"
      ? (only as HTMLImageElement)
      : null;
  }, [selection]);

  const aiContext = useMemo(() => {
    if (selection.length !== 1) return null;
    const el = selection[0];
    if (!el.isConnected) return null;
    return { label: elementLabel(el, t), html: el.outerHTML };
  }, [selection, t]);

  return (
    <div className="flex min-h-0 shrink-0">
      <nav
        aria-label={t("Tools")}
        className="flex w-rail shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-2"
      >
        {TABS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              aria-label={t(label)}
              onClick={() => onActiveChange(on ? null : id)}
              className={cn(
                "oc-press oc-focus flex w-[3.75rem] cursor-pointer flex-col items-center gap-1 rounded-lg px-1 py-2",
                on
                  ? "bg-accent-soft text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon
                className="h-5 w-5"
                strokeWidth={on ? 2.25 : 1.75}
                aria-hidden
              />
              <span className="text-micro font-medium leading-none">{t(label)}</span>
            </button>
          );
        })}
      </nav>

      {active === "design" && (
        <DesignPanel
          onClose={close}
          brand={brand}
          aspectRatio={aspectRatio}
          onReplaceSlide={onReplaceSlide}
          onBackground={onBackground}
          background={background}
          onBrandChange={onBrandChange}
        />
      )}

      {active === "elements" && (
        <ElementsPanel
          onClose={close}
          onInsert={onInsert}
          color={brand.colors.primary}
        />
      )}

      {active === "text" && (
        <TextPanel
          onClose={close}
          onInsert={onInsert}
          brand={brand}
          onFontsChange={(fonts) => onBrandChange({ ...brand, fonts })}
        />
      )}

      {active === "images" && (
        <ImagesPanel
          onClose={close}
          onInsert={onInsert}
          aspectRatio={aspectRatio}
          canGenerate={canGenerate}
          onUpload={onUpload}
          selectedImage={selectedImage}
          onReplace={onReplaceImage}
        />
      )}

      {active === "brand" && (
        <BrandPanel
          onClose={close}
          brand={brand}
          aspectRatio={aspectRatio}
          selectionCount={selection.length}
          onApplyStyle={onApplyStyle}
          onInsert={onInsert}
          onEditBrand={onEditBrand}
        />
      )}

      {/*
        Always mounted, hidden when another tab is open. Unmounting it mid
        stream threw the conversation away and aborted the request: opening
        "Elements" used to kill the generation you were watching.
      */}
      <PanelShell
        title={t("AI")}
        description={t("Ask it for a whole carousel, or for a change to whatever you have selected.")}
        onClose={close}
        flush
        hidden={active !== "ai"}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatPanel
            embedded
            visible={active === "ai"}
            carouselId={carouselId}
            engines={engines}
            referenceImages={referenceImages}
            onBeforeSend={onBeforeSend}
            onStreamStart={onStreamStart}
            onStreamEnd={onStreamEnd}
            chatInputRef={chatInputRef}
            context={aiContext}
            onClearContext={onClearSelection}
          />
        </div>
      </PanelShell>
    </div>
  );
}
