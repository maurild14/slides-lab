"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from "lucide-react";
import { replaceTextPreservingFormatting } from "@/lib/inspector-utils";
import { TEXT_EFFECTS } from "@/lib/element-style";
import { ColorInput } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import {
  ColorField,
  NumberField,
  Row,
  Section,
  SelectField,
  TextAreaField,
  ToggleGroup,
  focusOn,
  type SectionFocus,
} from "./InspectorFields";
import type { ElementProps, ElementStyleApi } from "./use-element-style";

const FONT_WEIGHTS = [
  { label: "Fina 300", value: "300" },
  { label: "Normal 400", value: "400" },
  { label: "Media 500", value: "500" },
  { label: "Semi 600", value: "600" },
  { label: "Negrita 700", value: "700" },
  { label: "Extra 800", value: "800" },
];

interface Props {
  props: ElementProps;
  api: ElementStyleApi;
  accent: string;
  swatches: { color: string; name: string }[];
  focus: SectionFocus;
}

export function TextSections({ props: p, api, accent, swatches, focus }: Props) {
  const { mutate, setStyle, setTextEffect } = api;

  // ponytail: the effect colour is not read back out of the CSS we wrote — it
  // seeds from the brand and re-applies on change. Parse it back only if
  // someone needs the picker to remember across selections.
  const [effectColor, setEffectColor] = useState(accent);

  const applyEffect = (id: string, color: string) => {
    const effect = TEXT_EFFECTS.find((e) => e.id === id);
    setTextEffect(effect ? effect.css(color) : {});
  };

  return (
    <>
      <Section title="Contenido" focused={focusOn(focus, "content")}>
        <TextAreaField
          value={p.text}
          onChange={(v) => mutate((el) => replaceTextPreservingFormatting(el, v))}
          placeholder="Sin texto"
          rows={3}
        />
        <p className="text-micro text-muted-foreground">
          También podés escribir directo en el slide: doble clic sobre el texto.
        </p>
      </Section>

      <Section title="Tipografía" focused={focusOn(focus, "typography")}>
        <Row label="Fuente">
          <input
            value={p.fontFamily}
            onChange={(e) => setStyle({ "font-family": `"${e.target.value}"` })}
            placeholder="Inter"
            aria-label="Familia tipográfica"
            className="h-control-sm w-full rounded-md border border-border bg-surface px-2 text-label oc-focus"
          />
        </Row>
        <Row label="Tamaño">
          <NumberField
            value={p.fontSize}
            min={8}
            max={400}
            suffix="px"
            onChange={(n) => setStyle({ "font-size": `${n}px` })}
          />
        </Row>
        <Row label="Peso">
          <SelectField
            value={String(Number.parseInt(p.fontWeight || "400", 10))}
            onChange={(v) => setStyle({ "font-weight": v })}
            options={FONT_WEIGHTS}
          />
        </Row>
        <Row label="Estilo">
          <div className="flex gap-1">
            <StyleToggle
              label="Negrita"
              on={Number.parseInt(p.fontWeight, 10) >= 600}
              onClick={() =>
                setStyle({
                  "font-weight": Number.parseInt(p.fontWeight, 10) >= 600 ? "400" : "700",
                })
              }
            >
              <Bold className="h-4 w-4" aria-hidden />
            </StyleToggle>
            <StyleToggle
              label="Cursiva"
              on={p.italic}
              onClick={() => setStyle({ "font-style": p.italic ? "normal" : "italic" })}
            >
              <Italic className="h-4 w-4" aria-hidden />
            </StyleToggle>
            <StyleToggle
              label="Subrayado"
              on={p.underline}
              onClick={() =>
                setStyle({ "text-decoration": p.underline ? "none" : "underline" })
              }
            >
              <Underline className="h-4 w-4" aria-hidden />
            </StyleToggle>
            <StyleToggle
              label="Mayúsculas"
              on={p.uppercase}
              onClick={() =>
                setStyle({ "text-transform": p.uppercase ? "none" : "uppercase" })
              }
            >
              <span className="text-label font-semibold leading-none">AA</span>
            </StyleToggle>
          </div>
        </Row>
        <Row label="Alineación">
          <ToggleGroup
            value={["left", "center", "right"].includes(p.textAlign) ? p.textAlign : "left"}
            onChange={(v) => setStyle({ "text-align": v })}
            options={[
              { value: "left", label: <AlignLeft className="h-4 w-4" /> },
              { value: "center", label: <AlignCenter className="h-4 w-4" /> },
              { value: "right", label: <AlignRight className="h-4 w-4" /> },
            ]}
          />
        </Row>
        <Row label="Interlínea">
          <NumberField
            value={p.lineHeight}
            min={0}
            max={400}
            suffix="px"
            placeholder="auto"
            onChange={(n) => setStyle({ "line-height": `${n}px` })}
          />
        </Row>
        <Row label="Espaciado" hint="Espacio entre letras">
          <NumberField
            value={p.letterSpacing}
            min={-20}
            max={60}
            step={0.5}
            suffix="px"
            onChange={(n) => setStyle({ "letter-spacing": `${n}px` })}
          />
        </Row>
        <Row label="Color">
          <ColorField value={p.color} onChange={(hex) => setStyle({ color: hex })} />
        </Row>
      </Section>

      <Section title="Efectos de texto" defaultOpen={false} focused={focusOn(focus, "effects")}>
        <div className="grid grid-cols-3 gap-1.5">
          {TEXT_EFFECTS.map((effect) => (
            <button
              key={effect.id}
              type="button"
              onClick={() => applyEffect(effect.id, effectColor)}
              aria-pressed={p.textEffect === effect.id}
              className={cn(
                "oc-press oc-focus flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border text-micro",
                p.textEffect === effect.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface hover:border-muted-foreground/40"
              )}
            >
              <span
                aria-hidden
                className="text-body font-bold text-foreground"
                style={effect.css(effectColor) as React.CSSProperties}
              >
                Ag
              </span>
              {effect.label}
            </button>
          ))}
        </div>
        {p.textEffect !== "none" && p.textEffect !== "emboss" && (
          <Row label="Color">
            <ColorInput
              label="Color del efecto"
              value={effectColor}
              swatches={swatches}
              onChange={(hex) => {
                setEffectColor(hex);
                applyEffect(p.textEffect, hex);
              }}
            />
          </Row>
        )}
      </Section>
    </>
  );
}

function StyleToggle({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={cn(
        "oc-press oc-focus oc-hit flex h-control-sm flex-1 cursor-pointer items-center justify-center rounded-md border",
        on
          ? "border-accent bg-accent-soft text-accent"
          : "border-border bg-surface text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
