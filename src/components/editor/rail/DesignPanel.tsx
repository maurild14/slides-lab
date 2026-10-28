"use client";

import { useT } from "@/components/locale-provider";
import { useCallback, useEffect, useState } from "react";
import { ImageIcon, LayoutTemplate } from "lucide-react";
import { ColorInput } from "@/components/ui/controls";
import { SlideRenderer } from "@/components/editor/SlideRenderer";
import { PanelEmpty, PanelGroup, PanelShell } from "./panel-kit";
import { cn } from "@/lib/utils";
import type { BrandConfig } from "@/types/brand";
import type { AspectRatio } from "@/types/carousel";
import type { Template } from "@/types/template";
import type { StylePreset } from "@/types/style-preset";

interface Props {
  onClose: () => void;
  brand: BrandConfig;
  aspectRatio: AspectRatio;
  /** Replace the current slide's whole body — one undo step. */
  onReplaceSlide: (html: string) => void;
  /** Set the slide root's `background` shorthand. */
  onBackground: (css: string) => void;
  /** Current background, read back from the slide root. */
  background: string;
  /** Save a brand change (a preset carries its own palette and type). */
  onBrandChange: (brand: BrandConfig) => void;
}

function gradients(b: BrandConfig): { id: string; css: string }[] {
  const { primary, secondary, accent, background, surface } = b.colors;
  return [
    { id: "p-s", css: `linear-gradient(135deg, ${primary}, ${secondary})` },
    { id: "p-a", css: `linear-gradient(135deg, ${primary}, ${accent})` },
    { id: "a-s", css: `linear-gradient(160deg, ${accent}, ${surface})` },
    { id: "bg-s", css: `linear-gradient(180deg, ${background}, ${surface})` },
    { id: "radial", css: `radial-gradient(circle at 30% 20%, ${accent}, ${primary})` },
    { id: "soft", css: `linear-gradient(135deg, ${surface}, ${background})` },
  ];
}

export function DesignPanel({
  onClose,
  brand,
  aspectRatio,
  onReplaceSlide,
  onBackground,
  background,
  onBrandChange,
}: Props) {
  const t = useT();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [presets, setPresets] = useState<StylePreset[] | null>(null);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d: { templates?: Template[] }) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]));
    fetch("/api/style-presets")
      .then((r) => r.json())
      .then((d: { presets?: StylePreset[] }) => setPresets(d.presets ?? []))
      .catch(() => setPresets([]));
  }, []);

  const applyPreset = useCallback(
    (preset: StylePreset) => {
      // The palette and type are the reusable half; the example slide is a
      // sample, applied separately so a preset never wipes your work.
      onBrandChange({ ...brand, colors: preset.brand.colors, fonts: preset.brand.fonts });
    },
    [brand, onBrandChange]
  );

  // Only slides matching this carousel's shape: a 9:16 layout dropped into a
  // 4:5 slide overflows, and Phase 4 owns real re-layout.
  const usable = (templates ?? []).filter((tpl) => tpl.aspectRatio === aspectRatio);

  return (
    <PanelShell
      title={t("Design")}
      description={t("The slide background, your templates and your saved styles.")}
      onClose={onClose}
    >
      <PanelGroup title={t("Slide background")}>
        <ColorInput
          label={t("Background color")}
          value={/^#[0-9a-f]{6}$/i.test(background) ? background : "#ffffff"}
          onChange={onBackground}
          swatches={Object.entries(brand.colors).map(([name, color]) => ({
            name: t(name[0].toUpperCase() + name.slice(1)),
            color,
          }))}
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {gradients(brand).map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onBackground(g.css)}
              aria-label={t("Gradient background {id}", { id: g.id })}
              className={cn(
                "oc-press oc-focus aspect-video cursor-pointer rounded-md border border-black/10",
                "hover:ring-2 hover:ring-ring hover:ring-offset-2 hover:ring-offset-surface"
              )}
              style={{ background: g.css }}
            />
          ))}
        </div>
        <p className="mt-2 text-micro text-muted-foreground">
          {t("For a background image, use the Images panel and stretch it across the whole slide.")}
        </p>
      </PanelGroup>

      <PanelGroup title={t("Templates")}>
        {templates === null ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="aspect-[4/5] animate-pulse rounded-md border border-border bg-muted"
              />
            ))}
          </div>
        ) : usable.length === 0 ? (
          <PanelEmpty>
            <LayoutTemplate className="mx-auto mb-2 h-5 w-5" aria-hidden />
            {t("There are no {ratio} templates. Save a carousel as a template from the top bar.", { ratio: aspectRatio })}
          </PanelEmpty>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {usable.flatMap((tpl) =>
              tpl.slides.map((slide, i) => (
                <button
                  key={`${tpl.id}-${slide.id}`}
                  type="button"
                  onClick={() => onReplaceSlide(slide.html)}
                  title={`${tpl.name} — slide ${i + 1}`}
                  aria-label={t("Apply slide {n} of {name} to the current slide", { n: i + 1, name: tpl.name })}
                  className="oc-press oc-focus cursor-pointer overflow-hidden rounded-md border border-border bg-surface hover:border-accent"
                >
                  <SlideRenderer
                    html={slide.html}
                    aspectRatio={tpl.aspectRatio}
                    className="aspect-[4/5] w-full bg-white"
                  />
                </button>
              ))
            )}
          </div>
        )}
      </PanelGroup>

      <PanelGroup title={t("Saved styles")}>
        {presets === null ? (
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        ) : presets.length === 0 ? (
          <PanelEmpty>
            <ImageIcon className="mx-auto mb-2 h-5 w-5" aria-hidden />
            {t("You haven't saved any styles yet.")}
          </PanelEmpty>
        ) : (
          <div className="flex flex-col gap-2">
            {presets.map((p) => (
              <div
                key={p.id}
                className="rounded-md border border-border bg-surface p-3"
              >
                <p className="text-body font-semibold">{p.name}</p>
                {p.description && (
                  <p className="mt-0.5 text-label text-muted-foreground">
                    {p.description}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  {Object.values(p.brand?.colors ?? {}).map((c, i) => (
                    <span
                      key={i}
                      className="h-4 w-4 rounded-sm border border-black/10"
                      style={{ background: c }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="oc-press oc-focus ml-auto cursor-pointer rounded-sm px-2 py-1 text-label font-medium text-accent hover:bg-accent-soft"
                  >
                    {t("Apply to the brand")}
                  </button>
                </div>
                {p.exampleSlideHtml && (
                  <button
                    type="button"
                    onClick={() => onReplaceSlide(p.exampleSlideHtml)}
                    className="oc-press oc-focus mt-1 w-full cursor-pointer rounded-sm border border-border py-1.5 text-label hover:bg-muted"
                  >
                    {t("Use its example slide")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </PanelGroup>
    </PanelShell>
  );
}
