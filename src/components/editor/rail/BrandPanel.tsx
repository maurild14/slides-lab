"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { DROP_WIDTH_RATIO } from "@/lib/canvas-utils";
import type { DragPayload } from "@/lib/slide-elements";
import { PanelEmpty, PanelGroup, PanelShell, insertProps } from "./panel-kit";
import type { BrandConfig } from "@/types/brand";
import type { AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

type Target = "background" | "color" | "borderColor";

const TARGETS = [
  { value: "background" as const, label: "Relleno" },
  { value: "color" as const, label: "Texto" },
  { value: "borderColor" as const, label: "Borde" },
];

const COLOR_LABEL: Record<keyof BrandConfig["colors"], string> = {
  primary: "Primario",
  secondary: "Secundario",
  accent: "Acento",
  background: "Fondo",
  surface: "Superficie",
};

interface Props {
  onClose: () => void;
  brand: BrandConfig;
  aspectRatio: AspectRatio;
  selectionCount: number;
  /** Write one CSS property on every selected element, as one undo step. */
  onApplyStyle: (property: Target | "fontFamily", value: string) => void;
  onInsert: (payload: DragPayload) => void;
  /** Open the brand wizard — brand lives in a dialog, not on a route. */
  onEditBrand: () => void;
}

export function BrandPanel({
  onClose,
  brand,
  aspectRatio,
  selectionCount,
  onApplyStyle,
  onInsert,
  onEditBrand,
}: Props) {
  const [target, setTarget] = useState<Target>("background");
  const disabled = selectionCount === 0;
  const { width: slideW } = DIMENSIONS[aspectRatio];

  return (
    <PanelShell
      title="Marca"
      description="Aplicá los colores y las fuentes de tu marca a lo que tengas seleccionado."
      onClose={onClose}
    >
      <PanelGroup
        title="Colores"
        action={
          <Button variant="ghost" size="sm" onClick={onEditBrand}>
            <Settings2 className="h-4 w-4" aria-hidden />
            Editar
          </Button>
        }
      >
        <div className="mb-3">
          <Segmented
            label="Dónde se aplica el color"
            value={target}
            onChange={setTarget}
            options={TARGETS}
          />
        </div>

        {disabled && (
          <p className="mb-2 text-label text-muted-foreground">
            Seleccioná algo en el slide para poder aplicarlos.
          </p>
        )}

        <div className="grid grid-cols-5 gap-2">
          {(Object.keys(COLOR_LABEL) as (keyof BrandConfig["colors"])[]).map((key) => {
            const color = brand.colors[key];
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => onApplyStyle(target, color)}
                title={`${COLOR_LABEL[key]} — ${color}`}
                aria-label={`Aplicar ${COLOR_LABEL[key]} (${color})`}
                className={cn(
                  "oc-press oc-focus oc-hit aspect-square cursor-pointer rounded-md border border-black/10",
                  "hover:ring-2 hover:ring-ring hover:ring-offset-2 hover:ring-offset-surface",
                  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:ring-0"
                )}
                style={{ background: color }}
              />
            );
          })}
        </div>
        <div className="mt-1.5 grid grid-cols-5 gap-2">
          {(Object.keys(COLOR_LABEL) as (keyof BrandConfig["colors"])[]).map((key) => (
            <span
              key={key}
              className="truncate text-center text-micro text-muted-foreground"
            >
              {COLOR_LABEL[key]}
            </span>
          ))}
        </div>
      </PanelGroup>

      <PanelGroup title="Tipografías">
        <div className="flex flex-col gap-2">
          {(["heading", "body"] as const).map((slot) => {
            const font = brand.fonts[slot];
            return (
              <button
                key={slot}
                type="button"
                disabled={disabled}
                onClick={() => onApplyStyle("fontFamily", `'${font}', sans-serif`)}
                aria-label={`Aplicar ${font} (${slot === "heading" ? "títulos" : "cuerpo"})`}
                className="oc-press oc-focus flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface"
              >
                <span
                  className="min-w-0 flex-1 truncate text-body font-semibold"
                  style={{ fontFamily: `${font}, sans-serif` }}
                >
                  {font}
                </span>
                <span className="shrink-0 text-micro text-muted-foreground">
                  {slot === "heading" ? "Títulos" : "Cuerpo"}
                </span>
              </button>
            );
          })}
        </div>
      </PanelGroup>

      <PanelGroup title="Logo">
        {brand.logoPath ? (
          <button
            type="button"
            {...insertProps(() => {
              const width = Math.round(slideW * DROP_WIDTH_RATIO);
              onInsert({
                html: `<img src="${brand.logoPath}" alt="${brand.name || "Logo"}" style="width:${width}px;height:auto">`,
                width,
                height: width,
                previewUrl: brand.logoPath!,
              });
            })}
            aria-label="Insertar el logo"
            title="Logo — arrastralo o tocalo"
            className="oc-press oc-focus flex h-28 w-full cursor-grab items-center justify-center rounded-md border border-border bg-muted/40 p-4 hover:border-accent active:cursor-grabbing"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brand.logoPath}
              alt=""
              draggable={false}
              className="pointer-events-none max-h-full max-w-full object-contain"
            />
          </button>
        ) : (
          <PanelEmpty>
            Todavía no cargaste un logo.{" "}
            <button
              type="button"
              onClick={onEditBrand}
              className="oc-focus cursor-pointer text-accent underline underline-offset-4"
            >
              Subilo desde la marca
            </button>
            .
          </PanelEmpty>
        )}
      </PanelGroup>
    </PanelShell>
  );
}
