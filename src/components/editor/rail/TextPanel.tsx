"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import {
  FONT_PAIRS,
  textCatalog,
  type DragPayload,
  type FontPair,
} from "@/lib/slide-elements";
import { InsertRow, PanelGroup, PanelShell } from "./panel-kit";
import { cn } from "@/lib/utils";
import type { BrandConfig } from "@/types/brand";

/** How each preset should read in its row, so the list looks like what it makes. */
const SAMPLE: Record<string, string> = {
  title: "text-display font-bold leading-tight",
  subtitle: "text-title font-semibold",
  body: "text-body",
  quote: "text-body italic",
  label: "text-micro font-semibold uppercase tracking-[0.14em]",
  badge: "text-label font-semibold",
  number: "text-display font-extrabold",
};

interface Props {
  onClose: () => void;
  onInsert: (payload: DragPayload) => void;
  brand: BrandConfig;
  /** Persist a new heading/body pair on the brand. */
  onFontsChange: (fonts: { heading: string; body: string }) => void;
}

export function TextPanel({ onClose, onInsert, brand, onFontsChange }: Props) {
  const presets = useMemo(
    () =>
      textCatalog({
        headingFont: brand.fonts.heading,
        bodyFont: brand.fonts.body,
        color: brand.colors.primary,
        accent: brand.colors.accent,
      }),
    [brand]
  );

  const activePair = (pair: FontPair) =>
    pair.heading === brand.fonts.heading && pair.body === brand.fonts.body;

  return (
    <PanelShell
      title="Texto"
      description="Cada preset llega con la tipografía y el color de tu marca."
      onClose={onClose}
    >
      <PanelGroup title="Presets">
        <div className="flex flex-col gap-2">
          {presets.map((spec) => (
            <InsertRow
              key={spec.id}
              spec={spec}
              onInsert={onInsert}
              hint={spec.label}
              sample={
                <span
                  className={cn("block truncate", SAMPLE[spec.id])}
                  style={{ fontFamily: `${brand.fonts.heading}, inherit` }}
                >
                  {spec.id === "number" ? "01" : "Texto de ejemplo"}
                </span>
              }
            />
          ))}
        </div>
      </PanelGroup>

      <PanelGroup title="Combinaciones tipográficas">
        <p className="mb-2 text-label text-muted-foreground">
          Cambia la marca: los presets nuevos salen con estas fuentes.
        </p>
        <div className="flex flex-col gap-2">
          {FONT_PAIRS.map((pair) => {
            const active = activePair(pair);
            return (
              <button
                key={pair.id}
                type="button"
                onClick={() => onFontsChange({ heading: pair.heading, body: pair.body })}
                aria-pressed={active}
                className={cn(
                  "oc-press oc-focus flex w-full cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-left",
                  active
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-surface hover:border-muted-foreground/40"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-body font-semibold"
                    style={{ fontFamily: `${pair.heading}, sans-serif` }}
                  >
                    {pair.heading}
                  </p>
                  <p
                    className="truncate text-label text-muted-foreground"
                    style={{ fontFamily: `${pair.body}, sans-serif` }}
                  >
                    {pair.body} · {pair.mood}
                  </p>
                </div>
                {active && (
                  <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </PanelGroup>
    </PanelShell>
  );
}
