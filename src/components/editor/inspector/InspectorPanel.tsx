"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ImageIcon,
  MousePointerClick,
  Pencil,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getBreadcrumb,
  isTextEditable,
  readPx,
  replaceTextPreservingFormatting,
  rgbToHex,
} from "@/lib/inspector-utils";
import {
  ColorField,
  NumberField,
  Row,
  Section,
  SelectField,
  TextAreaField,
  ToggleGroup,
} from "./InspectorFields";

interface InspectorPanelProps {
  isOpen: boolean;
  enabled: boolean;
  onClose: () => void;
  selectedElement: HTMLElement | null;
  /** Bumped externally whenever the iframe reloads (clears stale reads). */
  iframeReadyTick: number;
  /** Notify parent that the slide HTML changed and should be saved. */
  onMutate: () => void;
  /** Reset slide to a previous version. */
  onUndo: () => void;
  saving?: boolean;
}

const FONT_WEIGHTS = [
  { label: "Thin 300", value: "300" },
  { label: "Regular 400", value: "400" },
  { label: "Medium 500", value: "500" },
  { label: "Semibold 600", value: "600" },
  { label: "Bold 700", value: "700" },
  { label: "Extrabold 800", value: "800" },
];

export function InspectorPanel({
  isOpen,
  enabled,
  onClose,
  selectedElement,
  iframeReadyTick,
  onMutate,
  onUndo,
  saving,
}: InspectorPanelProps) {
  // Re-read computed styles whenever selection changes or after a mutation
  const [tick, setTick] = useState(0);
  const bumpTick = useCallback(() => setTick((n) => n + 1), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when iframe reloads
  useEffect(() => {
    setTick((n) => n + 1);
  }, [iframeReadyTick, selectedElement]);

  const props = useMemo(() => {
    if (!selectedElement) return null;
    const win = selectedElement.ownerDocument.defaultView;
    if (!win) return null;
    const cs = win.getComputedStyle(selectedElement);
    return {
      tag: selectedElement.tagName.toLowerCase(),
      breadcrumb: getBreadcrumb(selectedElement),
      isImage: selectedElement.tagName.toLowerCase() === "img",
      isTextLike: isTextEditable(selectedElement),
      text: selectedElement.textContent || "",
      color: rgbToHex(cs.color),
      backgroundColor: rgbToHex(cs.backgroundColor),
      fontFamily: cs.fontFamily.split(",")[0].replace(/['"]/g, "").trim(),
      fontSize: readPx(selectedElement, "fontSize", win),
      fontWeight: cs.fontWeight || "400",
      lineHeight: cs.lineHeight,
      textAlign: cs.textAlign || "left",
      paddingTop: readPx(selectedElement, "paddingTop", win),
      paddingRight: readPx(selectedElement, "paddingRight", win),
      paddingBottom: readPx(selectedElement, "paddingBottom", win),
      paddingLeft: readPx(selectedElement, "paddingLeft", win),
      borderRadius: readPx(selectedElement, "borderRadius", win),
      src: (selectedElement as HTMLImageElement).src || "",
      alt: (selectedElement as HTMLImageElement).alt || "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElement, tick]);

  const mutate = useCallback(
    (fn: () => void) => {
      if (!selectedElement) return;
      fn();
      bumpTick();
      onMutate();
    },
    [selectedElement, bumpTick, onMutate]
  );

  const handleImageReplace = useCallback(
    async (file: File) => {
      if (!selectedElement || selectedElement.tagName.toLowerCase() !== "img")
        return;
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { url: string };
        mutate(() => {
          (selectedElement as HTMLImageElement).src = data.url;
        });
      } catch {
        // ignore
      }
    },
    [selectedElement, mutate]
  );

  if (!isOpen) return null;

  return (
    <aside
      className="w-[280px] shrink-0 border-l border-border bg-surface flex flex-col h-full"
      aria-label="Slide inspector"
    >
      {/* Header */}
      <div className="h-11 px-3 border-b border-border flex items-center gap-2 shrink-0">
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold flex-1">Inspector</h2>
        {saving && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
            title="Saving…"
          />
        )}
        <button
          onClick={onClose}
          className="h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
          aria-label="Close inspector"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!enabled ? (
          <EmptyState
            icon={<Pencil className="h-5 w-5" />}
            title="Edit mode is off"
            hint="Enable Edit in the toolbar to start clicking elements on the slide."
          />
        ) : !props ? (
          <EmptyState
            icon={<MousePointerClick className="h-5 w-5" />}
            title="Nothing selected"
            hint="Click any text, image, or shape on the slide to edit it."
          />
        ) : (
          <>
            {/* Selection header */}
            <div className="px-3 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-1.5 h-5 rounded bg-foreground text-background text-[10px] font-mono uppercase">
                  {props.tag}
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {props.breadcrumb.join(" › ")}
                </span>
              </div>
            </div>

            {/* Image section (only for <img>) */}
            {props.isImage && (
              <Section title="Image">
                <div className="rounded-md border border-border bg-muted overflow-hidden">
                  {props.src ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={props.src}
                      alt={props.alt}
                      className="w-full h-28 object-contain bg-[conic-gradient(at_50%_50%,#f5f5f5_0%,#fafafa_50%,#f5f5f5_100%)]"
                    />
                  ) : (
                    <div className="h-28 flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageReplace(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-7 text-xs gap-1.5"
                >
                  <Upload className="h-3 w-3" />
                  Replace image
                </Button>
                <Row label="Alt">
                  <input
                    value={props.alt}
                    onChange={(e) =>
                      mutate(() => {
                        (selectedElement as HTMLImageElement).alt =
                          e.target.value;
                      })
                    }
                    className="h-7 w-full rounded-md border border-border bg-surface px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                </Row>
              </Section>
            )}

            {/* Text content */}
            {props.isTextLike && !props.isImage && (
              <Section title="Content">
                <TextAreaField
                  value={props.text}
                  onChange={(v) =>
                    mutate(() => {
                      if (selectedElement)
                        replaceTextPreservingFormatting(selectedElement, v);
                    })
                  }
                  placeholder="Empty"
                  rows={3}
                />
              </Section>
            )}

            {/* Typography */}
            {!props.isImage && (
              <Section title="Typography">
                <Row label="Family">
                  <input
                    value={props.fontFamily}
                    onChange={(e) =>
                      mutate(() => {
                        if (selectedElement)
                          selectedElement.style.fontFamily = `"${e.target.value}"`;
                      })
                    }
                    placeholder="Inter"
                    className="h-7 w-full rounded-md border border-border bg-surface px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                </Row>
                <Row label="Size">
                  <NumberField
                    value={props.fontSize}
                    min={8}
                    max={300}
                    step={1}
                    suffix="px"
                    onChange={(n) =>
                      mutate(() => {
                        if (selectedElement)
                          selectedElement.style.fontSize = `${n}px`;
                      })
                    }
                  />
                </Row>
                <Row label="Weight">
                  <SelectField
                    value={String(parseInt(props.fontWeight || "400", 10))}
                    onChange={(v) =>
                      mutate(() => {
                        if (selectedElement)
                          selectedElement.style.fontWeight = v;
                      })
                    }
                    options={FONT_WEIGHTS}
                  />
                </Row>
                <Row label="Align">
                  <ToggleGroup
                    value={["left", "center", "right"].includes(props.textAlign)
                      ? props.textAlign
                      : "left"}
                    onChange={(v) =>
                      mutate(() => {
                        if (selectedElement) selectedElement.style.textAlign = v;
                      })
                    }
                    options={[
                      { value: "left", label: <AlignLeft className="h-3 w-3" /> },
                      {
                        value: "center",
                        label: <AlignCenter className="h-3 w-3" />,
                      },
                      {
                        value: "right",
                        label: <AlignRight className="h-3 w-3" />,
                      },
                    ]}
                  />
                </Row>
                <Row label="Color">
                  <ColorField
                    value={props.color}
                    onChange={(hex) =>
                      mutate(() => {
                        if (selectedElement) selectedElement.style.color = hex;
                      })
                    }
                  />
                </Row>
              </Section>
            )}

            {/* Fill (background) */}
            <Section title="Fill">
              <Row label="Background">
                <ColorField
                  value={props.backgroundColor}
                  onChange={(hex) =>
                    mutate(() => {
                      if (selectedElement)
                        selectedElement.style.backgroundColor = hex;
                    })
                  }
                />
              </Row>
              <Row label="Radius">
                <NumberField
                  value={props.borderRadius}
                  min={0}
                  max={9999}
                  step={1}
                  suffix="px"
                  onChange={(n) =>
                    mutate(() => {
                      if (selectedElement)
                        selectedElement.style.borderRadius = `${n}px`;
                    })
                  }
                />
              </Row>
            </Section>

            {/* Spacing */}
            <Section title="Spacing" defaultOpen={false}>
              <Row label="Pad T">
                <NumberField
                  value={props.paddingTop}
                  step={1}
                  suffix="px"
                  onChange={(n) =>
                    mutate(() => {
                      if (selectedElement)
                        selectedElement.style.paddingTop = `${n}px`;
                    })
                  }
                />
              </Row>
              <Row label="Pad R">
                <NumberField
                  value={props.paddingRight}
                  step={1}
                  suffix="px"
                  onChange={(n) =>
                    mutate(() => {
                      if (selectedElement)
                        selectedElement.style.paddingRight = `${n}px`;
                    })
                  }
                />
              </Row>
              <Row label="Pad B">
                <NumberField
                  value={props.paddingBottom}
                  step={1}
                  suffix="px"
                  onChange={(n) =>
                    mutate(() => {
                      if (selectedElement)
                        selectedElement.style.paddingBottom = `${n}px`;
                    })
                  }
                />
              </Row>
              <Row label="Pad L">
                <NumberField
                  value={props.paddingLeft}
                  step={1}
                  suffix="px"
                  onChange={(n) =>
                    mutate(() => {
                      if (selectedElement)
                        selectedElement.style.paddingLeft = `${n}px`;
                    })
                  }
                />
              </Row>
            </Section>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="h-11 px-3 border-t border-border flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          className="h-7 text-xs gap-1.5 px-2"
          title="Revert to previous slide version"
        >
          <RefreshCw className="h-3 w-3" />
          Undo
        </Button>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">
          {saving ? "Saving…" : "Saved"}
        </span>
      </div>
    </aside>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className={cn("p-6 text-center")}>
      <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
        {icon}
      </div>
      <p className="text-xs font-medium mb-1">{title}</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {hint}
      </p>
    </div>
  );
}
