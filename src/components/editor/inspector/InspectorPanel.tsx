"use client";

import { useT } from "@/components/locale-provider";
import { MousePointerClick, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { SectionFocus } from "./InspectorFields";
import { useElementStyle } from "./use-element-style";
import { TextSections } from "./TextSections";
import { ImageSections } from "./ImageSections";
import { BoxSections } from "./BoxSections";

interface InspectorPanelProps {
  onClose: () => void;
  /** The single selected element, or null when zero or several are selected. */
  selectedElement: HTMLElement | null;
  /** How many elements are selected in total. */
  selectionCount: number;
  /** Bumped on every slide mutation and iframe reload — re-read the DOM. */
  iframeReadyTick: number;
  /** Notify the page that the slide HTML changed: one undo step, one save. */
  onMutate: () => void;
  /** Reset the slide to the previous version stored on the server. */
  onUndo: () => void;
  /** Section the floating toolbar asked to open, if any. */
  focus: SectionFocus;
  /** Brand colour new effects are born with, plus the palette for pickers. */
  accent: string;
  swatches: { color: string; name: string }[];
  onUpload: (file: File) => Promise<string | null>;
  saving?: boolean;
}

/**
 * The advanced panel: everything the floating toolbar does not put one click
 * away. It stays mounted rather than appearing on demand — the right column
 * already exists for the layer list, and a panel that comes and goes moves
 * every control under the cursor.
 */
export function InspectorPanel({
  onClose,
  selectedElement,
  selectionCount,
  iframeReadyTick,
  onMutate,
  onUndo,
  focus,
  accent,
  swatches,
  onUpload,
  saving,
}: InspectorPanelProps) {
  const t = useT();
  const api = useElementStyle(selectedElement, iframeReadyTick, onMutate);
  const props = api.props;

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={t("Element properties")}>
      {/* The save state is said once, in the footer. A second pulsing dot up
          here said the same thing without ever naming it. */}
      <div className="flex h-control-lg shrink-0 items-center gap-2 border-b border-border px-3">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="flex-1 text-section font-semibold">{t("Properties")}</h2>
        <IconButton label={t("Deselect")} size="sm" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!props ? (
          <EmptyState
            size="sm"
            icon={<MousePointerClick className="h-5 w-5" aria-hidden />}
            title={
              selectionCount > 1
                ? t("{n} elements selected", { n: selectionCount })
                : t("Nothing is selected")
            }
            hint={
              selectionCount > 1
                ? t("Properties are edited one element at a time. Align, group and order do work on several, from the bar above.")
                : t("Click any text, image or shape on the slide to edit it.")
            }
            className="px-6"
          />
        ) : (
          <>
            <div className="border-b border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 items-center rounded bg-foreground px-1.5 font-mono text-micro uppercase text-background">
                  {props.tag}
                </span>
                <span className="truncate text-micro text-muted-foreground">
                  {props.breadcrumb.join(" › ")}
                </span>
              </div>
            </div>

            {props.isImage ? (
              <ImageSections props={props} api={api} onUpload={onUpload} focus={focus} />
            ) : (
              props.isTextLike && (
                <TextSections
                  props={props}
                  api={api}
                  accent={accent}
                  swatches={swatches}
                  focus={focus}
                />
              )
            )}

            <BoxSections props={props} api={api} focus={focus} />
          </>
        )}
      </div>

      <div className="flex h-control-lg shrink-0 items-center gap-2 border-t border-border px-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          className="gap-1.5 px-2"
          title={t("Go back to the previous version saved on the server. To undo one step, use Ctrl Z.")}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          {t("Previous version")}
        </Button>
        <div className="flex-1" />
        <span className="text-micro text-muted-foreground" aria-live="polite">
          {saving ? t("Saving…") : t("Saved")}
        </span>
      </div>
    </section>
  );
}
