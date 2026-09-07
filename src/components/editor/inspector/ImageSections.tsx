"use client";

import { useRef } from "react";
import { FlipHorizontal, FlipVertical, ImageIcon, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/controls";
import {
  FILTER_DEFS,
  FILTER_PRESETS,
  IMAGE_FRAMES,
  buildFilters,
  presetFilters,
} from "@/lib/element-style";
import { cn } from "@/lib/utils";
import {
  Row,
  Section,
  ToggleGroup,
  focusOn,
  type SectionFocus,
} from "./InspectorFields";
import type { ElementProps, ElementStyleApi } from "./use-element-style";

interface Props {
  props: ElementProps;
  api: ElementStyleApi;
  onUpload: (file: File) => Promise<string | null>;
  focus: SectionFocus;
}

export function ImageSections({ props: p, api, onUpload, focus }: Props) {
  const { mutate, setStyle, flip } = api;
  const fileRef = useRef<HTMLInputElement>(null);

  const setFilter = (key: string, value: number) =>
    setStyle({ filter: buildFilters({ ...p.filters, [key]: value }) || "" });

  const dirty = buildFilters(p.filters) !== "";

  return (
    <>
      <Section title="Imagen" focused={focusOn(focus, "image")}>
        <div className="overflow-hidden rounded-md border border-border bg-muted">
          {p.src ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={p.src}
              alt={p.alt}
              className="h-28 w-full bg-[conic-gradient(at_50%_50%,#f5f5f5_0%,#fafafa_50%,#f5f5f5_100%)] object-contain"
            />
          ) : (
            <div className="flex h-28 items-center justify-center text-muted-foreground">
              <ImageIcon className="h-5 w-5" aria-hidden />
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const url = await onUpload(file);
            if (url) mutate((el) => ((el as HTMLImageElement).src = url));
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          className="h-control-sm w-full gap-1.5 text-label"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Reemplazar imagen
        </Button>
        <Row label="Alt" hint="Descripción de la imagen">
          <input
            value={p.alt}
            aria-label="Texto alternativo"
            onChange={(e) =>
              mutate((el) => ((el as HTMLImageElement).alt = e.target.value))
            }
            className="h-control-sm w-full rounded-md border border-border bg-surface px-2 text-label oc-focus"
          />
        </Row>
      </Section>

      <Section title="Encuadre" defaultOpen={false} focused={focusOn(focus, "crop")}>
        <CropField
          src={p.src}
          x={p.objectX}
          y={p.objectY}
          ratio={p.height > 0 ? p.width / p.height : 1}
          onChange={(x, y) =>
            setStyle({
              "object-fit": "cover",
              "object-position": `${Math.round(x)}% ${Math.round(y)}%`,
            })
          }
        />
        <Row label="Ajuste">
          <ToggleGroup
            value={["cover", "contain", "fill"].includes(p.objectFit) ? p.objectFit : "fill"}
            onChange={(v) => setStyle({ "object-fit": v })}
            options={[
              { value: "cover", label: "Cubrir" },
              { value: "contain", label: "Entero" },
              { value: "fill", label: "Estirar" },
            ]}
          />
        </Row>
        <Row label="Espejar">
          <div className="flex gap-1.5">
            <Button
              variant={p.flipX ? "default" : "outline"}
              size="sm"
              onClick={() => flip("x")}
              className="h-control-sm flex-1 gap-1.5 text-label"
            >
              <FlipHorizontal className="h-3.5 w-3.5" aria-hidden />
              Horizontal
            </Button>
            <Button
              variant={p.flipY ? "default" : "outline"}
              size="sm"
              onClick={() => flip("y")}
              className="h-control-sm flex-1 gap-1.5 text-label"
            >
              <FlipVertical className="h-3.5 w-3.5" aria-hidden />
              Vertical
            </Button>
          </div>
        </Row>
      </Section>

      <Section
        title="Filtros"
        defaultOpen={false}
        focused={focusOn(focus, "filters")}
        action={
          dirty ? (
            <button
              type="button"
              onClick={() => setStyle({ filter: "" })}
              className="oc-focus flex cursor-pointer items-center gap-1 rounded px-1 text-micro text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Restablecer
            </button>
          ) : null
        }
      >
        <div className="grid grid-cols-4 gap-1.5">
          {FILTER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              aria-label={`Filtro ${preset.label}`}
              onClick={() => setStyle({ filter: buildFilters(presetFilters(preset.id)) || "" })}
              className="oc-press oc-focus cursor-pointer overflow-hidden rounded-md border border-border bg-muted hover:border-accent"
            >
              {p.src ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={p.src}
                  alt=""
                  className="h-10 w-full object-cover"
                  style={{ filter: buildFilters(presetFilters(preset.id)) || undefined }}
                />
              ) : (
                <span className="block h-10" />
              )}
              <span className="block truncate px-1 py-0.5 text-micro text-muted-foreground">
                {preset.label}
              </span>
            </button>
          ))}
        </div>
        <div className="space-y-1.5 pt-1">
          {FILTER_DEFS.map((def) => (
            <div key={def.key} className="grid grid-cols-[64px_1fr] items-center gap-2">
              <span className="truncate text-label text-muted-foreground">{def.label}</span>
              <Slider
                label={def.label}
                value={p.filters[def.key] ?? def.base}
                min={def.min}
                max={def.max}
                suffix={def.unit === "%" ? "%" : def.unit}
                onChange={(v) => setFilter(def.key, v)}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Marco" defaultOpen={false} focused={focusOn(focus, "frame")}>
        <div className="grid grid-cols-3 gap-1.5">
          {IMAGE_FRAMES.map((frame) => (
            <button
              key={frame.id}
              type="button"
              onClick={() => setStyle({ "clip-path": frame.clip })}
              aria-pressed={p.frame === frame.id}
              className={cn(
                "oc-press oc-focus flex cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-micro",
                p.frame === frame.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface hover:border-muted-foreground/40"
              )}
            >
              <span
                aria-hidden
                className="block h-8 w-8 bg-foreground/70"
                style={{ clipPath: frame.clip || undefined }}
              />
              {frame.label}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

/**
 * Drag the image inside its own frame to reframe it.
 *
 * ponytail: this repositions with `object-position` instead of writing a real
 * crop rectangle. It is the crop that survives the PNG export untouched, and
 * it costs one pointer handler. A destructive crop would need a canvas pass
 * and a second uploaded file.
 */
function CropField({
  src,
  x,
  y,
  ratio,
  onChange,
}: {
  src: string;
  x: number;
  y: number;
  ratio: number;
  onChange: (x: number, y: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: React.PointerEvent) => {
    const box = boxRef.current;
    if (!box || !src) return;
    e.preventDefault();
    box.setPointerCapture(e.pointerId);
    const rect = box.getBoundingClientRect();
    const origin = { px: e.clientX, py: e.clientY, x, y };

    const move = (ev: PointerEvent) => {
      // Dragging right has to move the picture right, which means showing
      // less of its right-hand side: the sign is inverted on purpose.
      const nx = origin.x - ((ev.clientX - origin.px) / rect.width) * 100;
      const ny = origin.y - ((ev.clientY - origin.py) / rect.height) * 100;
      onChange(clamp(nx), clamp(ny));
    };
    const up = () => {
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
    };
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
  };

  if (!src) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-micro text-muted-foreground">
        Esta imagen no tiene archivo todavía.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div
        ref={boxRef}
        onPointerDown={startDrag}
        role="application"
        aria-label="Arrastrá para reencuadrar la imagen"
        className="w-full cursor-grab overflow-hidden rounded-md border border-border bg-muted active:cursor-grabbing"
        style={{ aspectRatio: ratio > 0 ? ratio : 1, touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-cover"
          style={{ objectPosition: `${x}% ${y}%` }}
        />
      </div>
      <p className="text-micro text-muted-foreground">
        Arrastrá la imagen para reencuadrarla dentro de su caja.
      </p>
    </div>
  );
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}
